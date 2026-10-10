// A claim's Trip, read and added through retreats' door (design §1.1, RB.11).
// A Trip is an events row of one of three types; retreats owns the table, so
// this module reads it with `selectEvents` and adds one with `insertEvents`,
// and the table-ownership gate sees neither as a raw cross-entity statement.
//
// A trip added from a claim is a draft with visibility `internal`, so it never
// reaches the public events pages, and it is owned by the person who added it.
// Naming a trip on a claim is an owner's edit like a receipt's: allowed while
// the claim is theirs to change (draft, or sent back), refused after.
import { selectEvents, insertEvents } from "@/entities/retreats";
import { recordAudit } from "@/kernel/audit/audit";
import { businessDate } from "@/kernel/config/dates";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import { slugify } from "@/kernel/config/slug";
import { mustRows } from "@/kernel/data/read";
import type { Result } from "@/kernel/data/result";
import { lockedBecause } from "./claim-files";
import { readClaimRow } from "./own-claims";
import { TRIP_EVENT_TYPES, TripInput, isTripEventType, type Trip, type TripInputType } from "./trip-rules";
import { updateReimbursementClaims } from "./writes";

const TRIP_COLUMNS = "id, title, type, starts_at, ends_at";

// events.starts_at is a timestamptz; a trip is a run of calendar days, read in
// the business's own zone so an event that starts at 06:00 in Saigon is that day.
const dayOf = (at: unknown) => (typeof at === "string" && at ? businessDate(at) : null);

function tripFrom(r: Record<string, unknown>): Trip {
  const type = String(r.type);
  return {
    id: String(r.id),
    title: String(r.title ?? ""),
    type: isTripEventType(type) ? type : "private_trip",
    startsOn: dayOf(r.starts_at),
    endsOn: dayOf(r.ends_at),
  };
}

/**
 * Every trip the picker offers, newest first. A failed read throws: an empty
 * picker would tell the person there are no trips, and they would add a copy.
 */
export async function listTrips(limit = 200): Promise<Trip[]> {
  const rows = mustRows(
    await selectEvents(TRIP_COLUMNS)
      .in("type", [...TRIP_EVENT_TYPES])
      .is("archived_at", null)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: false, nullsFirst: true })
      .limit(limit),
    "[reimbursements] trips for the picker",
  );
  return rows.map(tripFrom);
}

/** One trip by its event id, or null when there is no such event or it is not a trip. */
export async function readTrip(eventId: string): Promise<Trip | null> {
  const rows = mustRows(
    await selectEvents(TRIP_COLUMNS).eq("id", eventId).in("type", [...TRIP_EVENT_TYPES]).limit(1),
    "[reimbursements] one trip",
  );
  return rows[0] ? tripFrom(rows[0]) : null;
}

/** Midnight in Saigon on a calendar day, as events.starts_at stores it. */
const saigonMidnight = (day: string | null) => (day ? `${day}T00:00:00+07:00` : null);

/**
 * Adds a trip from the claim form: a draft, internal event of a trip type,
 * owned by the person adding it. The slug is the title and start date, with a
 * numeric suffix when taken, as retreats' own create does; nobody opens it,
 * because an internal event has no public page.
 */
export async function createTrip(input: {
  input: TripInputType;
  personId: string;
  actorLabel: string | null;
}): Promise<{ ok: true; trip: Trip } | { ok: false; error: string }> {
  const parsed = TripInput.safeParse(input.input);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const { title, type, startsOn, endsOn } = parsed.data;

  const base = slugify(startsOn ? `${title}-${startsOn}` : title) || "trip";
  // `ilike` rather than `like`: a slug is lowercase already, so the two match
  // the same rows, and the kernel fake the tests run on knows `ilike`.
  const { data: taken, error: takenError } = await selectEvents("slug").ilike("slug", `${base}%`);
  if (takenError) return { ok: false, error: `Could not add the event: ${takenError.message}` };
  const used = new Set((taken ?? []).map((r) => String(r.slug)));
  let slug = base;
  for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;

  const { data, error } = await insertEvents({
    slug,
    type,
    status: "draft",
    visibility: "internal",
    title,
    starts_at: saigonMidnight(startsOn),
    ends_at: saigonMidnight(endsOn),
    owner_person_id: input.personId,
  })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: `Could not add the event: ${error?.message ?? "no row"}` };
  await recordAudit({
    table: "events",
    recordId: data.id,
    operation: "insert",
    actor: input.actorLabel,
    newData: { slug, type, title, visibility: "internal" },
    context: { via: "reimbursement_claim_form" },
  });
  return { ok: true, trip: { id: data.id, title, type, startsOn, endsOn } };
}

/**
 * Names a trip on one of the owner's claims, or clears it (`null`), while the
 * claim is still theirs to change. The trip must be an event of a trip type.
 */
export async function setClaimTrip(input: { claimId: string; personId: string; tripEventId: string | null }): Promise<Result> {
  const claim = await readClaimRow(input.claimId, { ownedBy: input.personId });
  if (!claim.ok) return claim;
  const locked = lockedBecause(claim.value);
  if (locked) return { ok: false, error: locked };
  if (input.tripEventId !== null && !(await readTrip(input.tripEventId))) return { ok: false, error: "That event was not found." };
  const { data, error } = await updateReimbursementClaims({ trip_event_id: input.tripEventId })
    .eq("id", input.claimId)
    .eq("person_id", input.personId)
    .eq("status", claim.value.status)
    .select("id");
  if (error) return { ok: false, error: `Could not save the event: ${error.message}` };
  if ((data ?? []).length === 0) return { ok: false, error: "This claim changed while you were working on it. Reload and try again." };
  return { ok: true };
}

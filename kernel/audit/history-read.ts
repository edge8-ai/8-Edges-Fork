import { companyOs } from "@/kernel/data/supabase";
import { personName, UNNAMED } from "@/kernel/config/people-name";
import type { AuditEntry, AuditPage, AuditPageResult } from "./history";

// The read side of the append-only trail audit.ts writes. The OS had recorded
// every admin write since the beginning and exported no way to see any of it
// (S.4), so this is the one reader: one record's history, newest first, paged,
// with the actor resolved to a person.
//
// House rule, and the reason there is no second function here: this answers
// "what happened to this record", never "what has this person been doing".
// Nothing aggregates audit rows by actor, so no helper offers to.
//
// Not named reads.ts: a `reads.ts` under kernel/ or entities/ is a door-helper
// file, whose every export must be a thin `select<Table>` that names a table
// and hands the builder back (scripts/door-helper-tables.test.mjs). These two
// are readers, not doors.

/** Rows per page when the caller does not say. A drawer panel shows one screen. */
const DEFAULT_LIMIT = 20;
/** The ceiling on one page, so a caller cannot ask for the whole table. */
const MAX_LIMIT = 100;

const COLUMNS = "id, changed_at, operation, actor_label, actor_person_id, context";
/**
 * The before and after images, asked for only by a surface that renders the
 * change itself. Off by default, because the shared history tab ships its
 * entries to the browser and a contact's old_data is a person's details.
 */
const DATA_COLUMNS = ", old_data, new_data";

type AuditRow = {
  id: string;
  changed_at: string;
  operation: string;
  actor_label: string | null;
  actor_person_id: string | null;
  context: unknown;
  old_data?: unknown;
  new_data?: unknown;
};

type PersonRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  display_name: string | null;
  preferred_name: string | null;
};

/**
 * One page of a record's history.
 *
 * Paging is by offset rather than by a `changed_at` cursor on purpose: a bulk
 * action stamps every row it writes with one transaction time, so a keyset on
 * the timestamp would step straight over the rest of that group. The `id`
 * tiebreak below makes the offset order total, which is what makes the offset
 * safe.
 */
export async function listAuditFor(
  table: string,
  recordId: string,
  options: { limit?: number; offset?: number; withData?: boolean } = {},
): Promise<AuditPage> {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
  const offset = Math.max(Math.trunc(options.offset ?? 0), 0);

  // One row past the page answers hasMore without a second round-trip.
  const { data, error } = await companyOs
    .from("audit_log")
    .select(options.withData ? COLUMNS + DATA_COLUMNS : COLUMNS)
    .eq("table_name", table)
    .eq("record_id", recordId)
    .order("changed_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit);
  if (error) throw new Error(`audit_log: ${error.message}`);

  const rows = ((data ?? []) as unknown as AuditRow[]).slice();
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const names = await resolveActors(page);

  return {
    hasMore,
    entries: page.map((row): AuditEntry => ({
      id: row.id,
      at: row.changed_at,
      operation: row.operation,
      actor: actorName(row, names),
      context: asRecord(row.context) ?? {},
      ...(options.withData ? { oldData: asRecord(row.old_data), newData: asRecord(row.new_data) } : {}),
    })),
  };
}

/**
 * `listAuditFor` as a Result, for the one-line server action each surface puts
 * in front of it. The guard belongs to the surface (requireAdmin on an admin
 * shelf, boardActorFor on a board), so every action is that guard plus this
 * call — and the try/catch lives here rather than being copied into each one.
 */
export async function readAuditPage(
  table: string,
  recordId: string,
  offset: number,
  limit: number,
): Promise<AuditPageResult> {
  try {
    return { ok: true, page: await listAuditFor(table, recordId, { offset, limit }) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`audit_log: history read for ${table}/${recordId} failed: ${message}`);
    return { ok: false, error: message };
  }
}

/** A jsonb column as an object, or null when it holds anything else. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Person names for the page's actors, by person id and by lower-cased email. */
type ActorNames = { byId: Map<string, string>; byEmail: Map<string, string> };

async function resolveActors(rows: AuditRow[]): Promise<ActorNames> {
  const ids = [...new Set(rows.map((r) => r.actor_person_id).filter((v): v is string => !!v))];
  // Most rows carry only the admin's email in actor_label (recordAudit has
  // never filled actor_person_id), so the email is the working join.
  const emails = [
    ...new Set(
      rows
        .filter((r) => !r.actor_person_id)
        .map((r) => r.actor_label)
        .filter((v): v is string => !!v && v.includes("@"))
        .map((v) => v.toLowerCase()),
    ),
  ];
  const names: ActorNames = { byId: new Map(), byEmail: new Map() };
  if (ids.length === 0 && emails.length === 0) return names;

  const lookups: Promise<PersonRow[]>[] = [];
  if (ids.length > 0) lookups.push(selectPeople("id", ids));
  if (emails.length > 0) lookups.push(selectPeople("email", emails));
  const found = (await Promise.all(lookups)).flat();

  for (const person of found) {
    // personName decides the precedence, here as everywhere else. This loop
    // used to prefer full_name, which holds Vietnamese order (Family Middle
    // Given) for some rows and Western order for others — so the History tab
    // wrote a name the same person's card, drawer and digest wrote the other
    // way round.
    const name = personName(person);
    // A row with no name and no email yields the sentinel. Leaving it unmapped
    // is better than rendering it: actorName then falls through to the raw
    // actor_label, which is the admin's email — a poorer name, but a true one.
    if (name === UNNAMED) continue;
    names.byId.set(person.id, name);
    if (person.email) names.byEmail.set(person.email.toLowerCase(), name);
  }
  return names;
}

/**
 * A name lookup is decoration on a history that is already correct, so a
 * failure here logs and yields no names rather than losing the page. `people`
 * is a kernel table (entities.manifest.json), so the kernel reads it directly.
 */
async function selectPeople(column: "id" | "email", values: string[]): Promise<PersonRow[]> {
  const { data, error } = await companyOs
    .from("people")
    .select("id, email, full_name, display_name, preferred_name")
    .in(column, values);
  if (error) {
    console.error(`audit_log: actor lookup by ${column} failed: ${error.message}`);
    return [];
  }
  return (data ?? []) as unknown as PersonRow[];
}

function actorName(row: AuditRow, names: ActorNames): string | null {
  if (row.actor_person_id) {
    const byId = names.byId.get(row.actor_person_id);
    if (byId) return byId;
  }
  if (row.actor_label) {
    return names.byEmail.get(row.actor_label.toLowerCase()) ?? row.actor_label;
  }
  return null;
}

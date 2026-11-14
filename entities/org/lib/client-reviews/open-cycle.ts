import { randomBytes } from "crypto";
import { z } from "zod";
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { one } from "@/kernel/config/embedded";
import type { TablesInsert } from "@/kernel/data/supabase/database.types";
import { askRaters } from "../reviews/ask-raters";
import { emailMembersTheirReviewIsOpen } from "./notices";

// Opening a client review cycle (CR.1.2). One cycle on one framework, its
// members, and the parts each member's review is made of: the member's own
// part, their client manager's part when they have one, and the skip-manager's
// part when the cycle has one. Every member is then told, through their Inbox
// and by email. A client manager or a skip-manager is never told by the app:
// the person running the cycle sends their links from her own email, because
// the client's mail may block automated messages and its contacts are flagged
// do-not-contact (spec, "Telling people").
//
// Opening is safe to run twice. A second run with the same client and name
// finds the open cycle and adds only the members and parts that are missing,
// and only those new parts are told. That is the whole of the protection
// against a half-written cycle, since the database client here cannot hold a
// transaction across the three tables: a run that stops halfway is finished by
// running it again.
//
// Nothing here reads a session. The caller authorizes first: today that is
// the opening script, run by a person who holds the reviews permission, and
// the open-cycle screen's server action (CR.2.5) will guard with it.

const uuid = z.string().uuid();

export const OpenCycleInput = z
  .object({
    companyId: uuid.nullable(),
    frameworkId: uuid,
    name: z.string().trim().min(1).max(120),
    openedByPersonId: uuid,
    skipManagerPersonId: uuid.nullable(),
    members: z
      .array(z.object({ teamMemberId: uuid, clientManagerPersonId: uuid.nullable() }))
      .min(1)
      .max(200),
  })
  .refine((v) => new Set(v.members.map((m) => m.teamMemberId)).size === v.members.length, {
    message: "A member is listed twice.",
  });
export type OpenCycleInput = z.infer<typeof OpenCycleInput>;

export type OpenCycleResult =
  | { ok: true; cycleId: string; reused: boolean; membersAdded: number; partsAdded: number; told: number; emailed: number }
  | { ok: false; error: string };

/** The part kinds a client review is made of. */
type ClientPartKind = "self" | "client_manager" | "skip_manager";

type FrameworkRow = {
  id: string;
  rating_scale: string;
  archived_at: string | null;
  member_survey: { slug: string } | { slug: string }[] | null;
  rater_survey: { slug: string } | { slug: string }[] | null;
};

/** 32 random bytes, URL-safe: a personal link is its own credential. */
export function newLinkToken(): string {
  return randomBytes(32).toString("base64url");
}

/** The label every part of one cycle carries, so the company's own review screens group them as one cycle. */
export function clientCycleLabel(cycleId: string): string {
  return `client:${cycleId}`;
}

export async function openClientReviewCycle(raw: unknown): Promise<OpenCycleResult> {
  const parsed = OpenCycleInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "The cycle is not complete." };
  const input = parsed.data;

  const frameworks = mustRows(
    await companyOs
      .from("review_frameworks")
      .select("id, rating_scale, archived_at, member_survey:surveys!member_survey_id(slug), rater_survey:surveys!rater_survey_id(slug)")
      .eq("id", input.frameworkId),
    "[org/client-reviews] the framework",
  ) as unknown as FrameworkRow[];
  const framework = frameworks[0];
  if (!framework) return { ok: false, error: "That framework does not exist." };
  if (framework.archived_at) return { ok: false, error: "That framework is retired." };
  const memberSlug = one(framework.member_survey)?.slug;
  const raterSlug = one(framework.rater_survey)?.slug;
  if (!memberSlug || !raterSlug) return { ok: false, error: "That framework's forms are missing." };

  // 1. The cycle, found or opened. A closed cycle of the same name is never
  // reopened by opening: closing stopped its links on purpose.
  const cyclesOfClient = companyOs.from("review_cycles").select("id, name, closed_at, skip_manager_person_id, framework_id");
  const sameName = mustRows(
    await (input.companyId === null ? cyclesOfClient.is("company_id", null) : cyclesOfClient.eq("company_id", input.companyId)),
    "[org/client-reviews] cycles of this client",
  ).filter((c) => c.name.toLowerCase() === input.name.toLowerCase());
  let cycleId: string;
  let reused = false;
  if (sameName[0]) {
    if (sameName[0].closed_at) return { ok: false, error: "A closed cycle already has that name." };
    // Finishing a cycle on another framework would write its parts on the
    // wrong forms, so a run that names a different one is refused.
    if (sameName[0].framework_id !== framework.id) return { ok: false, error: "That cycle runs a different framework." };
    cycleId = sameName[0].id;
    reused = true;
  } else {
    const { data, error } = await companyOs
      .from("review_cycles")
      .insert({
        company_id: input.companyId,
        framework_id: framework.id,
        name: input.name,
        opened_by: input.openedByPersonId,
        skip_manager_person_id: input.skipManagerPersonId,
        skip_manager_token: input.skipManagerPersonId ? newLinkToken() : null,
      })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: "Could not open the cycle." };
    cycleId = data.id;
  }
  const hasSkipManager = reused ? Boolean(sameName[0]?.skip_manager_person_id) : Boolean(input.skipManagerPersonId);

  // 2. The members. A member already in the cycle keeps their row as it is.
  const existingMembers = mustRows(
    await companyOs.from("review_cycle_members").select("team_member_id").eq("cycle_id", cycleId),
    "[org/client-reviews] members of the cycle",
  );
  const known = new Set(existingMembers.map((m) => m.team_member_id));
  const newMembers = input.members.filter((m) => !known.has(m.teamMemberId));
  if (newMembers.length > 0) {
    const { error } = await companyOs.from("review_cycle_members").insert(
      newMembers.map((m) => ({
        cycle_id: cycleId,
        team_member_id: m.teamMemberId,
        client_manager_person_id: m.clientManagerPersonId,
      })),
    );
    if (error) return { ok: false, error: "Could not add the members. Run the opening again to finish it." };
  }

  // 3. The parts. One per member and kind, written only where missing.
  const existingParts = mustRows(
    await companyOs.from("performance_reviews").select("team_member_id, rater_kind").eq("review_cycle_id", cycleId),
    "[org/client-reviews] parts of the cycle",
  );
  const havePart = new Set(existingParts.map((p) => `${p.team_member_id}:${p.rater_kind}`));
  const part = (teamMemberId: string, kind: ClientPartKind, extra: Partial<TablesInsert<{ schema: "company_os" }, "performance_reviews">>) => ({
    teamMemberId,
    kind,
    row: {
      team_member_id: teamMemberId,
      rater_kind: kind,
      review_type: "client",
      review_cycle_id: cycleId,
      cycle_label: clientCycleLabel(cycleId),
      rating_scale: framework.rating_scale,
      status: "open",
      source: "portal",
      // Every row names every key the others name. The parts go in as one
      // insert, and the client sends a key one row lacks as NULL, not as the
      // column default: a skip-manager part with no metadata key was sent as a
      // NULL metadata, which the column refuses, and the whole insert failed
      // when the first cycle was opened (CR.1.6).
      reviewer_id: null,
      access_token: null,
      metadata: {},
      ...extra,
    } satisfies TablesInsert<{ schema: "company_os" }, "performance_reviews">,
  });
  const wanted: Array<ReturnType<typeof part>> = [];
  for (const m of input.members) {
    wanted.push(part(m.teamMemberId, "self", { reviewer_id: m.teamMemberId, metadata: { survey_slug: memberSlug } }));
    if (m.clientManagerPersonId) {
      wanted.push(part(m.teamMemberId, "client_manager", { access_token: newLinkToken(), metadata: { survey_slug: raterSlug } }));
    }
    if (hasSkipManager) wanted.push(part(m.teamMemberId, "skip_manager", {}));
  }
  const missing = wanted.filter((w) => !havePart.has(`${w.teamMemberId}:${w.kind}`));
  let added: Array<{ id: string; rater_kind: string; team_member_id: string }> = [];
  if (missing.length > 0) {
    const { data, error } = await companyOs
      .from("performance_reviews")
      .insert(missing.map((w) => w.row))
      .select("id, rater_kind, team_member_id");
    if (error || !data) return { ok: false, error: "Could not write the review parts. Run the opening again to finish it." };
    added = data;
  }

  // 4. Tell the members whose own part was written now. Telling never fails
  // the opening: the parts exist, and the Inbox and the email are how people
  // learn of them, not what they are.
  const newSelfParts = added.filter((p) => p.rater_kind === "self");
  const told = await askRaters(newSelfParts.map((p) => p.id));
  const emailed = await emailMembersTheirReviewIsOpen(newSelfParts.map((p) => p.team_member_id));

  return { ok: true, cycleId, reused, membersAdded: newMembers.length, partsAdded: added.length, told, emailed };
}

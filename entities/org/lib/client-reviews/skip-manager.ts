import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { isUuid } from "@/kernel/config/slug";
import type { Embedded } from "@/kernel/config/embedded";
import type { SurveyFieldRow } from "../surveys-schema";
import { PART_COLUMNS, factsFrom, signedInAt, tokenMatches, type ClientPartRow, type CycleMemberRow, type CycleRow } from "./access";
import type { ClientReviewFacts } from "./rules";

// The rows behind the skip-manager's one link to a cycle (CR.3.2). The
// credential is the link's token, checked against the cycle's own, or the
// skip-manager signing in with portal access at the cycle's client (CR.3.6,
// signedInAt); nothing here reads a session itself, the caller passes the
// sign-in's people. The rules module decides the rest from the
// facts these rows become (./access, factsFrom). The views (./skip-view) and
// the commands (./skip-commands) both read through here, so a page and a write
// can never disagree about what a link may reach.
//
// Every read is a must-read: a failed read is an error, never a link that
// looks as if it stopped working.

export type SkipCycle = CycleRow & {
  company_id: string | null;
  opened_by: string;
  skip_manager_token: string | null;
  companies: Embedded<{ name: string }>;
};

export type SkipMember = CycleMemberRow & { team_member_id: string; client_manager_person_id: string | null };

const CYCLE_COLUMNS = "id, name, closed_at, framework_id, opened_by, skip_manager_person_id, skip_manager_token, skip_manager_link_cancelled_at, company_id, companies:companies!company_id(name)";
const MEMBER_COLUMNS = "team_member_id, client_manager_person_id, withdrawn_at, rater_unlocked_at, skip_waived_at, released_at";

/**
 * How a client contact presents themselves: the token on their link, or their
 * sign-in, as every people row linked to it (CR.3.6). Read by the portal route
 * that calls in; an empty list is someone not signed in.
 */
export type ContactKey = { token: string | null; personIds?: readonly string[] };

/**
 * The cycle a link names, whether the token presented is its skip-manager's,
 * and whether the signed-in person is its skip-manager. Null when the id
 * names no cycle; the caller then says the link does not work, the same words
 * as for a wrong token.
 */
export async function skipCycle(cycleId: string, key: ContactKey): Promise<{ cycle: SkipCycle; tokenMatches: boolean; signedIn: boolean } | null> {
  if (!isUuid(cycleId)) return null;
  const cycle = mustRows(
    await companyOs.from("review_cycles").select(CYCLE_COLUMNS).eq("id", cycleId).limit(1),
    "[org/client-reviews] review_cycles",
  )[0] as unknown as SkipCycle | undefined;
  if (!cycle) return null;
  const signedIn = await signedInAt(key.personIds, cycle.skip_manager_person_id, cycle.company_id);
  // The skip-manager signed in meets the cycle with its link's cancellation
  // set aside (CR.3.6): cancelling stops the link, not the person. Every rule
  // after this one (opening a member, writing a note, the list's stages) reads
  // the cycle from here, so none of them refuses them on the link's account.
  const asMet = signedIn ? { ...cycle, skip_manager_link_cancelled_at: null } : cycle;
  return { cycle: asMet, tokenMatches: signedIn || tokenMatches(key.token, cycle.skip_manager_token), signedIn };
}

/** Every member of the cycle and every part of their reviews. */
export async function skipCycleRows(cycleId: string): Promise<{ members: SkipMember[]; parts: ClientPartRow[] }> {
  const [membersRes, partsRes] = await Promise.all([
    companyOs.from("review_cycle_members").select(MEMBER_COLUMNS).eq("cycle_id", cycleId),
    companyOs.from("performance_reviews").select(PART_COLUMNS).eq("review_cycle_id", cycleId).eq("review_type", "client"),
  ]);
  return {
    members: mustRows(membersRes, "[org/client-reviews] review_cycle_members") as SkipMember[],
    parts: mustRows(partsRes, "[org/client-reviews] performance_reviews") as ClientPartRow[],
  };
}

/** One member's facts and parts, from the rows of the whole cycle. Null when they are not in it. */
export function skipMemberFacts(
  cycle: SkipCycle,
  rows: { members: SkipMember[]; parts: ClientPartRow[] },
  teamMemberId: string,
): { member: SkipMember; facts: ClientReviewFacts; parts: ReturnType<typeof factsFrom>["parts"] } | null {
  const member = rows.members.find((m) => m.team_member_id === teamMemberId);
  if (!member) return null;
  const { facts, parts } = factsFrom(cycle, member, rows.parts.filter((p) => p.team_member_id === teamMemberId));
  return { member, facts, parts };
}

/** The rater's form of the cycle's framework: the questions the skip-manager reads both parts against. */
export async function raterFieldsOf(frameworkId: string): Promise<SurveyFieldRow[]> {
  const framework = mustRows(
    await companyOs.from("review_frameworks").select("rater_survey_id").eq("id", frameworkId).limit(1),
    "[org/client-reviews] review_frameworks",
  )[0] as { rater_survey_id: string | null } | undefined;
  if (!framework?.rater_survey_id) return [];
  return mustRows(
    await companyOs
      .from("survey_fields")
      .select("id, survey_id, position, type, label, help_text, required, config")
      .eq("survey_id", framework.rater_survey_id)
      .order("position", { ascending: true }),
    "[org/client-reviews] survey_fields",
  ) as SurveyFieldRow[];
}

/** The skip-manager's notes on one member, keyed by the question each sits beside. */
export function notesOf(part: Pick<ClientPartRow, "metadata"> | null): Record<string, string> {
  const raw = part?.metadata?.comments;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === "string"));
}

import { personBoardState, readBoardState } from "@/entities/boards";
import { selectTeamDirectory } from "@/entities/org";
import { selectIdeas } from "@/entities/ideas";
import { selectCoachingProfiles, selectCoachingOneOnOnes } from "@/entities/coaching";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";

// The weekly per-person summary behind the individual DM (individual-summary
// cron). It is an operational digest of one person's week — the same shape and
// spirit as the daily check-in, computed for Product, Operations and EO — not a
// score, and it goes only to the person it describes. The founder's roll-up
// that ranked people from it (team-insights, U.3) was deleted on 2026-10-10:
// a metric describes the work, the pipeline or a client outcome, never a person.

// The departments whose active, non-contract members get a weekly summary.
const SUMMARY_DEPARTMENTS = ["Product Development", "Operations", "EO"];
// A person counts as having a recorded 1-1 when their most recent held 1-1 is
// within this many days; older than that reads as "no recent 1-1".
const ONE_ON_ONE_RECENT_DAYS = 14;

export type PersonSummary = {
  personId: string;
  name: string;
  email: string | null;
  department: string | null;
  /** Most recent 1-1 marked held within the recency window. */
  oneOnOneRecorded: boolean;
  oneOnOneDate: string | null;
  ideasThisWeek: number;
  backlog: number;
  doing: number;
  completed: number;
};

type DirectoryRow = NamedPerson & { person_id: string | null; email: string | null; department_name: string | null };
type ProfileRow = { id: string; team_members: { person_id: string | null } | { person_id: string | null }[] | null };
type OneOnOneRow = { coaching_profile_id: string; held_on: string | null };

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/**
 * Gather one week's summary for every active, non-contract person in Product,
 * Operations and EO. Read-only; throws only if the roster read fails, because a
 * summary for nobody is worse than a visible failure.
 */
export async function gatherIndividualSummaries(now: Date = new Date()): Promise<PersonSummary[]> {
  const weekAgoIso = isoDaysAgo(7);

  const { data: dirData, error: dirError } = await selectTeamDirectory(
    `person_id, ${NAME_COLUMNS}, department_name, employment_type`,
  )
    .eq("status", "active")
    .in("department_name", SUMMARY_DEPARTMENTS)
    .neq("employment_type", "contract");
  if (dirError) throw new Error(`team directory: ${dirError.message}`);
  const people = ((dirData ?? []) as unknown as DirectoryRow[]).filter((p) => p.person_id);

  // Ideas submitted this week, counted per person.
  const { data: ideaData, error: ideaError } = await selectIdeas("person_id, created_at")
    .gte("created_at", weekAgoIso)
    .neq("status", "archived");
  if (ideaError) throw new Error(`ideas: ${ideaError.message}`);
  const ideasByPerson = new Map<string, number>();
  for (const r of (ideaData ?? []) as { person_id: string | null }[]) {
    if (r.person_id) ideasByPerson.set(r.person_id, (ideasByPerson.get(r.person_id) ?? 0) + 1);
  }

  // Person -> coaching profile, then most recent held 1-1 per profile.
  const { data: profData, error: profError } = await selectCoachingProfiles(
    "id, team_members:team_members!team_member_id(person_id)",
  );
  if (profError) throw new Error(`coaching profiles: ${profError.message}`);
  const profileByPerson = new Map<string, string>();
  for (const p of (profData ?? []) as unknown as ProfileRow[]) {
    const pid = one(p.team_members)?.person_id;
    if (pid) profileByPerson.set(pid, p.id);
  }
  const { data: oooData, error: oooError } = await selectCoachingOneOnOnes("coaching_profile_id, held_on")
    .eq("status", "held")
    .gte("held_on", new Date(Date.now() - ONE_ON_ONE_RECENT_DAYS * 86_400_000).toISOString().slice(0, 10))
    .order("held_on", { ascending: false });
  if (oooError) throw new Error(`coaching 1-1s: ${oooError.message}`);
  const lastHeldByProfile = new Map<string, string>();
  for (const r of (oooData ?? []) as unknown as OneOnOneRow[]) {
    if (r.held_on && !lastHeldByProfile.has(r.coaching_profile_id)) lastHeldByProfile.set(r.coaching_profile_id, r.held_on);
  }

  // Cards across every active board, read and classified per person by the
  // boards entity's one rule, which the daily check-in and the board digest
  // read too (U.2). This file used to match the doing lane by any name
  // containing "doing" while the check-in matched the whole name, and counted
  // a card finished only by its completion stamp while the check-in also took
  // a move into Done, so the two could disagree about the same person.
  const board = await readBoardState();
  const completedSince = Date.now() - 7 * 86_400_000;

  return people.map((p) => {
    const personId = p.person_id as string;
    const state = personBoardState(board, personId, completedSince);
    const completed = state.done.length;
    const doing = state.doing.length;
    const backlog = state.waiting.length;
    const profileId = profileByPerson.get(personId);
    const oneOnOneDate = profileId ? (lastHeldByProfile.get(profileId) ?? null) : null;
    return {
      personId,
      name: personName(p, "Unknown"),
      email: p.email,
      department: p.department_name,
      oneOnOneRecorded: Boolean(oneOnOneDate),
      oneOnOneDate,
      ideasThisWeek: ideasByPerson.get(personId) ?? 0,
      backlog,
      doing,
      completed,
    };
  });
}

/** The Lark DM one person receives on Tuesday. */
export function summaryDm(s: PersonSummary): string {
  const oneOnOne = s.oneOnOneRecorded ? `recorded ${s.oneOnOneDate}` : "not recorded recently";
  const idea = s.ideasThisWeek > 0 ? `${s.ideasThisWeek} submitted` : "none submitted";
  return [
    `Your week on the board:`,
    `• 1-1: ${oneOnOne}`,
    `• Ideas: ${idea}`,
    `• Backlog: ${s.backlog} · Doing: ${s.doing} · Completed this week: ${s.completed}`,
  ].join("\n");
}

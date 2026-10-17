import { companyOs } from "@/kernel/data/supabase";
import { selectTasks } from "@/entities/boards";
import { OPEN_COMMITMENT_STATUSES, type CommitmentStatus } from "../types";

// What changed for each person on the roster since the 1-1 their coach last
// held (K.46). It lives beside roster.ts rather than inside it because roster.ts
// is close to its 400-line cap and because this is a different read: roster.ts
// walks the profiles, this walks the things that moved underneath them.
//
// Every number here counts work — commitments, notes, board cards — and none of
// them is ever used to sort or rank the people they belong to (CLAUDE.md). The
// roster prints them inside a sentence for exactly that reason.

export type RosterFacts = {
  openCommitments: number;
  kept: number;
  stuck: number;
  // The day the oldest still-blocked commitment became blocked, so the help
  // line can say how long it has been waiting. Null when nothing is blocked.
  stuckSince: string | null;
  notes: number;
  cardsDone: number;
};

export const NO_FACTS: RosterFacts = {
  openCommitments: 0,
  kept: 0,
  stuck: 0,
  stuckSince: null,
  notes: 0,
  cardsDone: 0,
};

export type FactsSubject = {
  profileId: string;
  // The member's people.id, which is what the Workboard stores as an assignee.
  personId: string;
  lastHeldOn: string | null;
};

type CommitmentRow = {
  coaching_profile_id: string;
  status: string;
  status_updated_at: string | null;
  updated_at: string;
  closed_at: string | null;
};

export async function getRosterFacts(subjects: FactsSubject[]): Promise<Map<string, RosterFacts>> {
  const out = new Map<string, RosterFacts>();
  if (subjects.length === 0) return out;
  const ids = subjects.map((s) => s.profileId);
  const since = new Map(subjects.map((s) => [s.profileId, s.lastHeldOn]));

  const [commitmentsRes, notesRes, cards] = await Promise.all([
    companyOs
      .from("coaching_commitments")
      .select("coaching_profile_id, status, status_updated_at, updated_at, closed_at")
      .in("coaching_profile_id", ids),
    companyOs
      .from("coaching_member_notes")
      .select("coaching_profile_id, created_at")
      .in("coaching_profile_id", ids)
      .is("archived_at", null),
    countCardsDone(subjects),
  ]);
  if (commitmentsRes.error) {
    console.error("[team/coaching/roster-facts] coaching_commitments", commitmentsRes.error);
  }
  if (notesRes.error) console.error("[team/coaching/roster-facts] coaching_member_notes", notesRes.error);

  for (const id of ids) out.set(id, { ...NO_FACTS, cardsDone: cards.get(id) ?? 0 });

  for (const c of (commitmentsRes.data ?? []) as CommitmentRow[]) {
    const facts = out.get(c.coaching_profile_id);
    if (!facts) continue;
    const status = c.status as CommitmentStatus;
    if (OPEN_COMMITMENT_STATUSES.includes(status)) facts.openCommitments += 1;
    if (status === "blocked") {
      facts.stuck += 1;
      // status_updated_at is when it was last moved; a row that predates that
      // column falls back to updated_at, which is never later than the move.
      const stuckOn = (c.status_updated_at ?? c.updated_at).slice(0, 10);
      if (!facts.stuckSince || stuckOn < facts.stuckSince) facts.stuckSince = stuckOn;
    }
    const cutoff = since.get(c.coaching_profile_id) ?? null;
    if (status === "completed" && c.closed_at && (!cutoff || c.closed_at.slice(0, 10) >= cutoff)) {
      facts.kept += 1;
    }
  }

  for (const n of (notesRes.data ?? []) as { coaching_profile_id: string; created_at: string }[]) {
    const facts = out.get(n.coaching_profile_id);
    if (!facts) continue;
    const cutoff = since.get(n.coaching_profile_id) ?? null;
    if (!cutoff || n.created_at.slice(0, 10) >= cutoff) facts.notes += 1;
  }

  return out;
}

// Board cards each member finished since their own last 1-1. The Workboard is
// another entity's table, so the read goes through the boards door and this
// caller keeps its own columns and filters. Only people the coach has actually
// met are asked about: with no 1-1 held there is no "since", and the roster
// says so in words instead of printing a number against nothing.
async function countCardsDone(subjects: FactsSubject[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const met = subjects.filter((s) => s.lastHeldOn && s.personId);
  if (met.length === 0) return counts;
  const earliest = met.map((s) => s.lastHeldOn as string).sort()[0];

  const { data, error } = await selectTasks("assignee_id, completed_at")
    .in("assignee_id", met.map((s) => s.personId))
    .eq("status", "done")
    .is("archived_at", null)
    .gte("completed_at", `${earliest}T00:00:00Z`);
  if (error) {
    console.error("[team/coaching/roster-facts] tasks", error);
    return counts;
  }
  const rows = (data ?? []) as unknown as { assignee_id: string | null; completed_at: string | null }[];
  for (const s of met) {
    const n = rows.filter(
      (r) => r.assignee_id === s.personId && (r.completed_at ?? "").slice(0, 10) >= (s.lastHeldOn as string),
    ).length;
    counts.set(s.profileId, n);
  }
  return counts;
}

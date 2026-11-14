// The clock's run over open Bounties (QS.2), every ten minutes: close the heads
// whose due time has passed, then remind the people still out on a head due
// within two hours. What to write is decided in clock-rules.ts; this reads the
// rows it needs and carries the decisions out.
//
// One run does both because both read the same open Bounties and their heads,
// and the two never reach the same head: a close needs the due time behind us
// and a reminder needs it ahead. A head therefore closes at most ten minutes
// after its due time, which the page already hides by reading a head past its
// time as closed (standing.hasClosed).
//
// Every write is conditional on what was read, so two runs that overlap, or a
// Giver closing early in the middle of one, cannot both land:
// - a Missed lands only while the row still holds the Standing read, so a
//   Turn-in made since stays a Turn-in;
// - a head closes only while closed_at is null, and the quest only while open,
//   and quest.closed is stated only by the write that moved it;
// - a reminder claims reminded_at only where it is still null and the row is
//   still out, and only the people whose rows this run claimed are named, so
//   nobody is reminded twice about one head. The claim comes before the send:
//   a send that then fails is not retried, because a missed reminder is better
//   than a doubled one.
//
// Reads that fail stop the run (the routine records it); a failed write stops
// only its own quest or head and is reported as that step's failure.
import { IN_CHUNK, mustPages, mustPagesIn } from "@/kernel/data/read";
import type { RoutineFailure } from "@/kernel/audit/routine-result";
import { listCurrentTeamPeople } from "@/kernel/identity/team-people";
import { announce } from "./announce";
import { closesDue, remindersDue, REMINDER_LEAD_MS, type ClockHead, type ClockQuest, type ClockRow, type ClosePlan, type Reminder } from "./clock-rules";
import { CLOCK_PARTY_COLUMNS, HEAD_COLUMNS, QUEST_COLUMNS, type ClockPartyDbRow, type HeadRow, type QuestRow } from "./rows";
import { selectQuestHeads, selectQuestParty, selectQuests } from "./reads";
import { updateQuestHeads, updateQuestParty, updateQuests } from "./writes";

const TAG = "[quests/clock]";

export type ClockRun = { closedHeads: number; missed: number; closedQuests: number; reminded: number; failures: RoutineFailure[] };

type Open = { quests: ClockQuest[]; heads: ClockHead[]; rows: ClockRow[] };

function toQuest(q: QuestRow): ClockQuest {
  return { id: q.id, title: q.title, facts: { kind: q.kind, state: q.state, giverId: q.giver_id, required: q.required } };
}

function toHead(h: HeadRow): ClockHead {
  return { id: h.id, questId: h.quest_id, position: h.position, ask: h.ask, closesAt: h.closes_at, closedAt: h.closed_at };
}

function toRow(r: ClockPartyDbRow): ClockRow {
  return {
    id: r.id,
    questId: r.quest_id,
    headId: r.head_id,
    personId: r.person_id,
    standing: r.standing,
    late: r.late,
    reacted: false,
    acceptedAt: r.accepted_at,
    turnedInAt: r.turned_in_at,
    handedBackAt: r.handed_back_at,
    missedAt: r.missed_at,
    remindedAt: r.reminded_at,
  };
}

/**
 * The open Bounties, all their heads, and the party rows on the heads the
 * clock may act on now: open heads whose due time has passed or is within the
 * reminder's lead. A failed read raises.
 *
 * Every open Bounty is read, page by page. An earlier draft capped the read at
 * 500, and a Bounty past the cap would never have closed or reminded anyone,
 * with nothing in the run to say so. The work a run does is bounded by the
 * heads due now, not by the open Bounties, so reading them all costs a page.
 */
async function readOpen(now: Date): Promise<Open> {
  const quests = (
    await mustPages<QuestRow>(`${TAG} open bounties`, (from, to) =>
      selectQuests(QUEST_COLUMNS).eq("kind", "bounty").eq("state", "open").order("created_at").order("id").range(from, to),
    )
  ).map(toQuest);
  if (quests.length === 0) return { quests, heads: [], rows: [] };
  const heads = (
    await mustPagesIn<HeadRow>(
      quests.map((q) => q.id),
      `${TAG} heads`,
      (slice, from, to) => selectQuestHeads(HEAD_COLUMNS).in("quest_id", slice).order("id").range(from, to),
    )
  ).map(toHead);
  const near = heads.filter((h) => h.closedAt === null && Date.parse(h.closesAt) - now.getTime() <= REMINDER_LEAD_MS).map((h) => h.id);
  if (near.length === 0) return { quests, heads, rows: [] };
  const rows = (
    await mustPagesIn<ClockPartyDbRow>(near, `${TAG} party rows`, (slice, from, to) => selectQuestParty(CLOCK_PARTY_COLUMNS).in("head_id", slice).order("id").range(from, to))
  ).map(toRow);
  return { quests, heads, rows };
}

/** Carries one quest's close out: its Missed rows, then its heads, then the quest. Returns what landed. A failed write raises. */
async function applyClose(plan: ClosePlan): Promise<{ missed: number; heads: number; closed: boolean }> {
  let missed = 0;
  for (const r of plan.rows) {
    const { data, error } = await updateQuestParty(r.patch).eq("id", r.rowId).eq("standing", r.standing).select("id");
    if (error) throw new Error(`Missed on row ${r.rowId}: ${error.message}`);
    missed += (data ?? []).length;
  }
  let heads = 0;
  for (const h of plan.heads) {
    const { data, error } = await updateQuestHeads({ closed_at: h.closedAt }).eq("id", h.headId).is("closed_at", null).select("id");
    if (error) throw new Error(`head ${h.headId}: ${error.message}`);
    heads += (data ?? []).length;
  }
  if (!plan.quest) return { missed, heads, closed: false };
  const { data, error } = await updateQuests(plan.quest).eq("id", plan.questId).eq("state", "open").select("id");
  if (error) throw new Error(`quest ${plan.questId}: ${error.message}`);
  return { missed, heads, closed: (data ?? []).length > 0 };
}

/** Claims one head's reminder for the rows still owed it, a chunk at a time, and returns the people this run claimed. A failed write raises. */
async function claim(reminder: Reminder, at: string): Promise<string[]> {
  const people = new Set<string>();
  for (let i = 0; i < reminder.rowIds.length; i += IN_CHUNK) {
    const { data, error } = await updateQuestParty({ reminded_at: at })
      .in("id", reminder.rowIds.slice(i, i + IN_CHUNK))
      .is("reminded_at", null)
      .in("standing", reminder.standings)
      .select("person_id");
    if (error) throw new Error(`reminder claim on head ${reminder.headId}: ${error.message}`);
    for (const r of (data ?? []) as { person_id: string }[]) people.add(r.person_id);
  }
  return [...people];
}

/** One run of the clock at `now`. Reads that fail raise; each quest's close and each head's reminder fails on its own. */
export async function runQuestClock(now: Date): Promise<ClockRun> {
  const run: ClockRun = { closedHeads: 0, missed: 0, closedQuests: 0, reminded: 0, failures: [] };
  const open = await readOpen(now);
  if (open.quests.length === 0) return run;

  for (const plan of closesDue(open.quests, open.heads, open.rows, now)) {
    try {
      const landed = await applyClose(plan);
      run.missed += landed.missed;
      run.closedHeads += landed.heads;
      if (!landed.closed) continue;
      run.closedQuests += 1;
      const failed = await announce("quest.closed", { questId: plan.questId, giverId: plan.giverId, by: "clock" });
      if (failed) run.failures.push({ subject: `quest ${plan.questId}`, step: "announce close", error: failed });
    } catch (err) {
      run.failures.push({ subject: `quest ${plan.questId}`, step: "close", error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Only a head within the reminder's lead has rows read, so no rows means no reminder to work out.
  if (open.rows.length === 0) return run;
  const due = remindersDue(open.quests, open.heads, open.rows, new Set((await listCurrentTeamPeople()).map((p) => p.id)), now);
  for (const reminder of due) {
    try {
      const personIds = await claim(reminder, now.toISOString());
      if (personIds.length === 0) continue;
      run.reminded += personIds.length;
      const { questId, headId, title, ask, closesAt } = reminder;
      const failed = await announce("quest.head.due_soon", { questId, headId, title, ask, closesAt, personIds });
      if (failed) run.failures.push({ subject: `head ${headId}`, step: "announce reminder", error: failed });
    } catch (err) {
      run.failures.push({ subject: `head ${reminder.headId}`, step: "remind", error: err instanceof Error ? err.message : String(err) });
    }
  }
  return run;
}

// What the clock decides about open Bounties (QS.2; spec 2026-10-20, "Heads",
// "Notifications: email, Lark and the inbox", "The pure core: standing"), in
// pure functions the routines only carry out. Two questions:
//
// - Which heads close now, which party rows that writes Missed, and which
//   quests close with their last head. Every answer comes from standing.ts
//   (closeHead, decide with the clock speaking, closesQuest), so a head the
//   clock closes is closed exactly as the Giver's early close would close it.
// - Who is reminded two hours before a head's due time: the people still out
//   on it who a close would mark Missed (owesMissed), so on a required Bounty
//   everyone called and on an optional one only those who accepted. Once per
//   person per head, staff only.
//
// Nothing here completes a Turn-in: the clock writes Missed or nothing, and a
// Turn-in is only ever the party member's own move.
import { closeHead, closesQuest, decide, hasClosed, owesMissed, type HeadFacts, type PartyPatch, type PartyRow, type QuestFacts, type QuestPatch, type Standing } from "./standing";

/** How long before a head's due time its reminder goes. */
export const REMINDER_LEAD_MS = 2 * 60 * 60 * 1000;

export type ClockQuest = { id: string; title: string; facts: QuestFacts };
export type ClockHead = { id: string; questId: string; position: number; ask: string; closesAt: string; closedAt: string | null };
export type ClockRow = PartyRow & { id: string; questId: string; remindedAt: string | null };

const headFacts = (h: ClockHead): HeadFacts => ({ closesAt: h.closesAt, closedAt: h.closedAt });

/** The Standings a reminder or a Missed can reach on this quest: a row still out that owes one. */
export function owingStandings(quest: Pick<QuestFacts, "kind" | "required">): Standing[] {
  return (["called", "accepted"] as const).filter((standing) => owesMissed({ standing }, quest));
}

/**
 * Whether one row is owed the two-hour reminder now: an open Bounty, a head
 * not yet closed whose due time is within the lead, a row never reminded, and
 * a Standing a close would mark Missed.
 */
export function owedReminder(row: Pick<ClockRow, "standing" | "remindedAt">, quest: QuestFacts, head: HeadFacts, now: Date): boolean {
  if (quest.kind !== "bounty" || quest.state !== "open") return false;
  if (row.remindedAt !== null || hasClosed(head, now)) return false;
  if (Date.parse(head.closesAt) - now.getTime() > REMINDER_LEAD_MS) return false;
  return owesMissed(row, quest);
}

/** One head's reminder: the rows to claim, with the Standings the claim may still find them in, and their people. */
export type Reminder = { questId: string; headId: string; title: string; ask: string; closesAt: string; rowIds: string[]; personIds: string[]; standings: Standing[] };

/**
 * The reminders due now, one per head with anyone owed one. A person no longer
 * on the team is left out, and their row is not claimed: the reminder exists
 * to reach staff, and nobody else is ever sent one.
 */
export function remindersDue(quests: readonly ClockQuest[], heads: readonly ClockHead[], rows: readonly ClockRow[], staff: ReadonlySet<string>, now: Date): Reminder[] {
  const byId = new Map(quests.map((q) => [q.id, q]));
  const out: Reminder[] = [];
  for (const head of heads) {
    const quest = byId.get(head.questId);
    if (!quest) continue;
    const owed = rows.filter((r) => r.headId === head.id && staff.has(r.personId) && owedReminder(r, quest.facts, headFacts(head), now));
    if (owed.length === 0) continue;
    out.push({
      questId: quest.id,
      headId: head.id,
      title: quest.title,
      ask: head.ask,
      closesAt: head.closesAt,
      rowIds: owed.map((r) => r.id),
      personIds: [...new Set(owed.map((r) => r.personId))],
      standings: owingStandings(quest.facts),
    });
  }
  return out;
}

/** What the clock writes for one quest: the Missed rows (each only while it holds the Standing read), the heads, and the quest. */
export type ClosePlan = {
  questId: string;
  giverId: string;
  rows: { rowId: string; standing: Standing; patch: PartyPatch }[];
  heads: { headId: string; closedAt: string }[];
  quest: QuestPatch | null;
};

/**
 * The closes due now. A head closes once its due time has passed; every row on
 * it that owes a Missed gets one; the quest closes when every head has. A
 * quest whose heads were all closed by an earlier run that stopped part way is
 * closed now. A plan with nothing to write is left out, so a replay writes
 * nothing.
 */
export function closesDue(quests: readonly ClockQuest[], heads: readonly ClockHead[], rows: readonly ClockRow[], now: Date): ClosePlan[] {
  const plans: ClosePlan[] = [];
  for (const quest of quests) {
    const own = heads.filter((h) => h.questId === quest.id);
    const plan: ClosePlan = { questId: quest.id, giverId: quest.facts.giverId, rows: [], heads: [], quest: null };
    for (const head of own) {
      const d = closeHead(quest.facts, headFacts(head), "clock", now);
      if (!("write" in d) || !d.write.head) continue;
      plan.heads.push({ headId: head.id, closedAt: d.write.head.closed_at });
      for (const row of rows.filter((r) => r.headId === head.id)) {
        const r = decide(row, quest.facts, headFacts(head), "clock", { say: "close" }, now);
        if ("write" in r && r.write.party) plan.rows.push({ rowId: row.id, standing: row.standing, patch: r.write.party });
      }
    }
    plan.quest = closesQuest(quest.facts, own.map(headFacts), now);
    if (plan.rows.length > 0 || plan.heads.length > 0 || plan.quest) plans.push(plan);
  }
  return plans;
}

// The words and the moves the Asks page draws from its read model (AK.2; spec
// 2026-11-16, "Answering" and "Following your own ask"; ADR 0036). Pure, so
// the page's words are decided and tested once: ask words only (ask, answer,
// thanks, late), due dates in Saigon, and counts of who was asked, never a name
// of someone who has not answered.
import { BUSINESS_TIME_ZONE, businessDate, diffDays } from "@/kernel/config/dates";
import { splitNickname } from "@/kernel/config/people-name";
import type { AskOfYou, AskYouMade } from "../lib/asks-read";
import type { QuestActions } from "./actions-type";

/** The four quest actions the page hands its buttons (spec "An Ask is a Bounty with one head"). The New ask drawer's summon rides beside them (NewAskActions). */
export type AskActions = Pick<QuestActions, "turnIn" | "reactToTurnIn" | "closeQuest" | "withdrawQuest">;

/** The line a Thanks sends: a Reaction the asker never has to write. */
export const THANKS_LINE = "Thanks for your answer.";

type OnHead = Pick<AskOfYou, "questId" | "headId">;

/**
 * The page's four moves, each one existing quest action: Answer is a Turn-in
 * on the ask's one head (its words, a link among them, go in as the text);
 * Thanks is a Reaction with the fixed line; Close now and Withdraw close or
 * withdraw the whole ask. There is no decline: an ask that waits on you is
 * required, and no ask can be handed back (AK.9; standing.ts lost the move
 * with AK.12).
 */
export function askMoves(actions: AskActions) {
  return {
    answer: (ask: OnHead, text: string) => actions.turnIn(ask.questId, ask.headId, { text: text.trim() }),
    thank: (ask: Pick<AskYouMade, "questId" | "headId">, answererId: string) => actions.reactToTurnIn(ask.questId, ask.headId, answererId, THANKS_LINE),
    closeNow: (ask: Pick<AskYouMade, "questId">) => actions.closeQuest(ask.questId),
    withdraw: (ask: Pick<AskYouMade, "questId">) => actions.withdrawQuest(ask.questId),
  };
}

export type AskMoves = ReturnType<typeof askMoves>;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
// A fixed list: en-GB's short month says "Sept", and the page says "Sep".
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** A Saigon calendar day as "Fri 20 Nov". */
function dayWords(isoDay: string): string {
  const [y, m, d] = isoDay.split("-").map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}

/**
 * When an ask is due, as the page says it in Saigon: "Due today, 18:00", "Due
 * tomorrow" or "Due Fri 20 Nov", and "Was due Fri 20 Nov" once the time has
 * passed. Soon is today or tomorrow, or past, and draws the pill in amber.
 */
export function dueLabel(dueAt: string, now: string): { text: string; soon: boolean } {
  const day = businessDate(dueAt);
  if (Date.parse(dueAt) <= Date.parse(now)) return { text: `Was due ${dayWords(day)}`, soon: true };
  const left = diffDays(businessDate(now), day);
  if (left <= 0) {
    const time = new Date(dueAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: BUSINESS_TIME_ZONE });
    return { text: `Due today, ${time}`, soon: true };
  }
  if (left === 1) return { text: "Due tomorrow", soon: true };
  return { text: `Due ${dayWords(day)}`, soon: false };
}

/** The Saigon day an ask closed, as its pill says it in Closed in the last two weeks: "Closed Mon 16 Nov" (AK.8). */
export function closedLabel(closedAt: string): string {
  return `Closed ${dayWords(businessDate(closedAt))}`;
}

/** What a closed ask made of the reader says while they have still not answered it (AK.8): the one move left is a late answer. */
export const STILL_YOU_CAN = "You hadn't answered when it closed. You still can.";

/** The name a person goes by, for a short line: their nickname when they have one, otherwise their first word. */
export function firstName(name: string): string {
  const { name: bare, nickname } = splitNickname(name);
  return nickname ?? bare.split(/\s+/).find(Boolean) ?? name;
}

/** Who an ask you made went to, as a count: names would say who has not answered. */
export function askedLine(asked: number): string {
  return asked === 1 ? "To 1 person" : `To ${asked} people`;
}

/** How an ask you made stands. */
export function answeredLine(ask: Pick<AskYouMade, "answered" | "asked">): string {
  return `${ask.answered} of ${ask.asked} answered`;
}

/** The line under an ask open to anyone: how many answered so far, which says nobody's name. */
export function answersSoFar(answered: number): string {
  if (answered === 0) return "No answers yet";
  return answered === 1 ? "1 answer so far" : `${answered} answers so far`;
}

/** What Waiting on you says beside its heading. */
export function waitingLabel(open: number): string {
  return open === 0 ? "Nothing waiting. Nice." : `${open} open`;
}

/**
 * The line an answer leaves where its buttons were, naming who sees it. An
 * answer to an ask that has closed says it went in late, because the model
 * records it as late and the asker's card and the manager report show it
 * (AK.9; standing.ts, quest-report.ts).
 */
export function landedLine(outcome: "answered" | "answered_late", askerName: string): string {
  const who = firstName(askerName);
  return outcome === "answered_late" ? `Answered late. ${who} can see it.` : `Answered. ${who} can see it.`;
}

// The words and small decisions the Quests page draws from one QuestCard
// (QS.1; spec 2026-10-20, "The page" and "Heads"). Pure, so the arena, the
// board and the drawer say the same thing, and so the rules the spec sets on
// the page's words are tested once: numbers are HP percentages, hit counts,
// heads down and company totals; nothing names anyone who has not turned in,
// nothing counts the members yet to answer, and nothing scores a hit.
import { BUSINESS_TIME_ZONE, businessDate, diffDays } from "@/kernel/config/dates";
import { monsterFor } from "../lib/fight";
import type { HeadCard, Monster, QuestCard, QuestsPage, Standing } from "../lib/quests-read";

/** The page head's line under "Quests", the same in both styles. */
export const QUESTS_SUB = "Asks that used to get lost in chat, sessions to teach each other, and things to show the world.";

/** What a quest is, said once in the empty arena so a first visit knows what Summon does. */
export const QUEST_WHY = "A quest is an ask that would otherwise get lost in chat. Summon one and the people you call find it here, with a reminder before it is due.";

/**
 * Whether the season banner has anything to say: a row of zeros is not news,
 * so it waits for the first. It counts exactly the banner's four company
 * totals (hits landed, fires lit, Beacons lit, learnings) and nothing else.
 */
export function seasonHasTally(season: QuestsPage["season"]): boolean {
  return season.hits + season.campfires + season.beacons + season.discoveries > 0;
}

/**
 * A Hydra chip's note on the Giver's party, before it lights: heads, never
 * people. A person called on one head has nothing to count, so "0 of 1 heads"
 * is not said.
 */
export function headsInNote(headsIn: number, heads: number): string | null {
  return heads > 1 ? `${headsIn} of ${heads} heads` : null;
}

/** How many avatar tones the portraits cycle through (the --color-client-* slots). */
const TONES = 12;

/** A stable tone for a person's portrait, from their id, so a face keeps its colour across the page. */
export function portraitTone(personId: string): number {
  let h = 0;
  for (let i = 0; i < personId.length; i++) h = (h * 31 + personId.charCodeAt(i)) >>> 0;
  return h % TONES;
}

export const MONSTER_NAME: Record<Monster, string> = { dragon: "Dragon", big_slime: "Big slime", slime: "Slime", hydra: "Hydra" };

/** What the drawer's preview says the Giver is summoning, by the Party called and the heads written. */
export function monsterPreview(partySize: number, headCount: number): { monster: Monster; name: string; line: string | null } {
  const monster = monsterFor(partySize, headCount);
  if (monster === "hydra") return { monster, name: `${headCount}-headed Hydra`, line: null };
  const line = { dragon: "the whole company fights it", big_slime: "a team-sized monster", slime: "a few hits take it down" }[monster];
  return { monster, name: MONSTER_NAME[monster], line };
}

/** What the drawer's preview says about whether the people called must answer. */
export function summonRule(summonerIsManager: boolean): string {
  return summonerIsManager ? "Required for everyone called" : "Optional: people accept it to join";
}

/** A due time as "Fri 24 Oct" and "18:00", read in Saigon. */
function dueParts(iso: string): { day: string; time: string } {
  const at = new Date(iso);
  const day = at.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: BUSINESS_TIME_ZONE });
  const time = at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: BUSINESS_TIME_ZONE });
  return { day: day.replace(",", ""), time };
}

/** Whether a head has stopped expecting Turn-ins: closed by the clock or by its Giver. */
export function headClosed(head: Pick<HeadCard, "closed" | "closesAt">, now: string): boolean {
  return head.closed || Date.parse(now) >= Date.parse(head.closesAt);
}

/** The line under a head's ask: when it closes and how many Saigon days are left, or that it has closed. */
export function dueLine(head: Pick<HeadCard, "closed" | "closesAt">, questState: QuestCard["state"], now: string): string {
  if (questState === "withdrawn") return "Withdrawn";
  const { day, time } = dueParts(head.closesAt);
  if (headClosed(head, now)) return `Closed ${day}`;
  const left = diffDays(businessDate(now), businessDate(head.closesAt));
  if (left <= 0) return `Closes today, ${time}`;
  return `Closes ${day}, ${time} · ${left === 1 ? "1 day left" : `${left} days left`}`;
}

/** The board card's one due line: the nearest open head, or the last head once all have closed. */
export function questDueLine(card: Pick<QuestCard, "state" | "heads">, now: string): string {
  const open = card.heads.filter((h) => !headClosed(h, now));
  const head = open[0] ?? card.heads[card.heads.length - 1];
  return head ? dueLine(head, card.state, now) : card.state === "withdrawn" ? "Withdrawn" : "Closed";
}

/** A head is down when the party has taken it to 30 HP or under, or it closed defeated. */
export function headDown(head: Pick<HeadCard, "hp" | "verdict">): boolean {
  return head.verdict === "defeated" || head.hp <= 30;
}

/** The Hydra's count: heads, never people. */
export function headsDownLine(heads: Pick<HeadCard, "hp" | "verdict">[]): string {
  const down = heads.filter(headDown).length;
  return `${down} of ${heads.length} heads down`;
}

/** How the whole bounty ended: defeated when every head is, else it got away. Null while open. */
export function questVerdict(card: Pick<QuestCard, "state" | "heads">): "defeated" | "got_away" | null {
  if (card.state !== "closed") return null;
  return card.heads.every((h) => h.verdict === "defeated") ? "defeated" : "got_away";
}

/** The Giver's mood is the bounty's mood, never a mark on anyone in the Party. */
export type Mood = "hopeful" | "pleased" | "delighted" | "sad";

export function giverMood(card: Pick<QuestCard, "hp" | "state" | "heads">): Mood {
  if (questVerdict(card) === "got_away") return "sad";
  if (card.hp <= 40) return "delighted";
  if (card.hp <= 65) return "pleased";
  return "hopeful";
}

/**
 * What the Giver says beside a one-head monster. It moves with the HP and with
 * the close, the same lightness either way; a fresh hit is greeted by name,
 * which only ever names someone who has turned in.
 */
export function giverLine(card: Pick<QuestCard, "hp" | "state" | "heads" | "monster">, freshHit: { name: string; mine: boolean } | null): string {
  const beast = card.monster === "dragon" ? "dragon" : "slime";
  if (card.state === "withdrawn") return "I took this one back. Thank you to everyone who answered.";
  if (card.state === "closed") return questVerdict(card) === "defeated" ? "We took it down! Thank you, party." : `The ${beast} got away this time. Fine, we'll get the next one.`;
  if (freshHit) return freshHit.mine ? "Nice hit! It felt that one." : `${freshHit.name} landed one! Who's next?`;
  if (card.hp > 85) return `A ${beast}'s loose in the office. Who strikes first?`;
  if (card.hp > 60) return "It felt that! Keep the turn-ins coming.";
  if (card.hp > 30) return "It's wobbling! We're past halfway.";
  return "One more push and it's down!";
}

/** What the Giver says beside a Hydra, as its heads go down. */
export function hydraLine(card: Pick<QuestCard, "state" | "heads">): string {
  if (card.state === "withdrawn") return "I took this one back. Thank you to everyone who answered.";
  const down = card.heads.filter(headDown).length;
  if (card.state === "closed") return questVerdict(card) === "defeated" ? "Every head down. Thank you, party." : "Some heads got away this time. We'll get the next one.";
  if (down === card.heads.length) return "Every head is down. That's the whole ask done, as a team.";
  if (down > 0) return "A head is down! Keep the turn-ins coming.";
  return "Heads up, all of them. Take the nearest one first.";
}

/** The reader's own standing, said as the game says it. Missed reads "Got away" and only its owner ever sees it. */
export const STANDING_LABEL: Record<Standing, string> = {
  called: "Called",
  accepted: "Accepted",
  turned_in: "Hit landed",
  handed_back: "Handed back",
  missed: "Got away",
};

type MoveCard = Pick<QuestCard, "state" | "required" | "heads">;
type MoveHead = Pick<HeadCard, "mine" | "closed" | "closesAt">;

/** The open heads the reader was called on and has not answered: what Accept and Decline act on. */
export function calledHeads(card: Pick<QuestCard, "heads">, now: string): HeadCard[] {
  return card.heads.filter((h) => h.mine?.standing === "called" && !headClosed(h, now));
}

/** An optional bounty is opted into: a called reader may accept it. A required one is never accepted, it is already on. */
export function canAccept(card: MoveCard, now: string): boolean {
  return !card.required && card.state === "open" && calledHeads(card, now).length > 0;
}

/** Decline is the hand-back of an optional bounty the reader was called on, before accepting. */
export function canDecline(card: MoveCard, now: string): boolean {
  return canAccept(card, now);
}

/**
 * Whether the reader may turn in on one head. Turning in counts as accepting,
 * so a called reader may turn in straight away, on an optional bounty as on a
 * required one (lib/standing.ts). A Turn-in after the close is taken, recorded
 * as late, and lifts a Missed; it counts in full. A reader who handed back may
 * still turn in while the head is open. Only a withdrawn quest takes none.
 */
export function canTurnIn(card: MoveCard, head: MoveHead, now: string): boolean {
  const s = head.mine?.standing;
  if (card.state === "withdrawn" || !s) return false;
  if (s === "called") return card.state === "open";
  if (s === "accepted" || s === "missed") return true;
  if (s === "handed_back") return card.state === "open" && !headClosed(head, now);
  return false;
}

/** Hand back, with a note, is for an accepted head of an optional bounty while it is open. */
export function canHandBack(card: MoveCard, head: MoveHead, now: string): boolean {
  return !card.required && card.state === "open" && !headClosed(head, now) && head.mine?.standing === "accepted";
}

/** The one line under the reader's moves, when there is a move to make: plain, never shaming. */
export function movesHint(card: MoveCard & Pick<QuestCard, "giver">, now: string): string | null {
  if (card.state !== "open") return null;
  if (card.required) {
    const owed = card.heads.some((h) => canTurnIn(card, h, now) && h.mine?.standing !== "handed_back");
    return owed ? `From ${card.giver.name}, required. Turn it in, late if you must.` : null;
  }
  return canAccept(card, now) ? "Accept it and we'll remind you before it closes." : null;
}

/** What the tavern board is, in one line (version 10): the Bounties other than the boss, which nobody is required to take. */
export const TAVERN_WHY = "Optional bounties: asks from teammates that you can take on.";

/** The tavern board with nothing on it (version 10): what it would hold, and the one move that fills it. */
export const TAVERN_EMPTY = "The tavern board is quiet. Summon a quest to post an ask anyone can take on.";

/** Everyone lit on any head, newest first and each once: the board card's faces. */
export function litAcross(card: Pick<QuestCard, "heads">): QuestCard["heads"][number]["lit"] {
  const seen = new Set<string>();
  return card.heads.flatMap((h) => h.lit).filter((p) => (seen.has(p.personId) ? false : (seen.add(p.personId), true)));
}

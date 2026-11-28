// Every move on a party member's Standing (QS.1; spec 2026-10-20, "The pure
// core: standing" and "Heads"; ADR 0019, ADR 0020). A Standing is set by three
// voices: the member about their own row, the Giver about their quest, and the
// clock when a head's due time has passed. Each move is decided here, in one
// pure step shaped like Training's attendance-word (A.40): given the party row,
// the quest, the head the row answers, who speaks and what they say, decide
// returns the write, the refusal, or nothing to do. The writers that carry a
// decision out live elsewhere and only apply it. No database trigger decides a
// Standing: the W.147 cascade is the reason no quest is a card, and Quests must
// not recreate it.
//
// A Bounty has one or more heads, each one ask with its own due time, and a
// party row answers one head: a person can have landed the first head and
// still owe the second. A Bounty is required when its Giver was a manager or an
// admin when they summoned it, and optional otherwise.
//
// The rules, from the design review, the approved prototype and Khoa's 20 October
// changes:
//
//   Optional Bounty                          Required Bounty
//   Called ┄┄accept┄┄▶ Accepted              Accepted (being called is the commitment)
//     │                 │                      │
//     │                 ├─turn in─▶ Turned in  ├─turn in─▶ Turned in
//     │                 ├┄hand back┄▶ Handed   └─(head closes)─▶ Missed
//     │                 │             back
//     │                 └─(head closes)─▶ Missed
//     ├─turn in─▶ Turned in (turning in counts as accepting)
//     ├┄hand back┄▶ Handed back (declining; the note was optional)
//     └─(head closes)─▶ stays Called: never opted in, so not Missed
//   Missed ──turn in (late)──▶ Turned in, late = true
//   Handed back ──turn in──▶ Turned in, late once the head has closed
//   Any ──(quest withdrawn)──▶ Standing kept; nobody becomes Missed
//
//   The dotted moves are no longer moves. Accept went with AK.11 and hand back
//   with AK.12 (Khoa, 17 November 2026): the Asks page offered neither, and
//   their actions went before them. An optional Bounty's Accepted and Handed
//   back rows are the ones the retired Quests page wrote, and the rules below
//   still hold them.
//
// - A Turn-in is the one move a party member makes.
// - A Turn-in after its head's due time, or on a closed head, is taken,
//   recorded as late, and lifts a Missed. It counts in full.
// - No ask can be declined. A required Bounty never could: it is a task, and a
//   head still out when it closes is Missed, which the person and their
//   managers see (ADR 0020; Khoa, 20 October and again 17 November 2026). An
//   optional one cannot since AK.12, and the Asks page offers no decline at all
//   (ADR 0036).
// - Closing early is the Giver's and closes every open head the way the due
//   time does. A quest closes when its last head has.
// - Withdrawing keeps every Standing and never writes a Missed; it is refused
//   once any head's due time has passed, because the Missed that head owes
//   would be unwritten.
// - Only the Giver may close, withdraw or react; a Reaction needs a Turn-in.
// - A party member speaks only about their own row.
//
// Whether a party member's move is open is answered once, by openMoves, which
// decide reads (A.96). Before that the Quests page re-derived the rules and hid
// a Turn-in the server took: a person who had handed back could not turn in
// once the head closed, though this file records that Turn-in as late. The
// module imports nothing, so a "use client" file may read it.

export type Standing = "called" | "accepted" | "turned_in" | "handed_back" | "missed";
export type QuestKind = "bounty" | "raid" | "beacon";
export type QuestState = "open" | "closed" | "withdrawn";

/** One party row as the pure step needs it: the person, the head it answers, their Standing and the times of their moves. */
export type PartyRow = {
  personId: string;
  headId: string;
  standing: Standing;
  late: boolean;
  /** Whether the Giver has reacted to this row's Turn-in; there is at most one Reaction. */
  reacted: boolean;
  acceptedAt: string | null;
  turnedInAt: string | null;
  handedBackAt: string | null;
  missedAt: string | null;
};

/**
 * The quest's facts a move depends on. required is true when the Giver was a
 * manager or an admin when they summoned it.
 */
export type QuestFacts = { kind: QuestKind; state: QuestState; giverId: string; required: boolean };

/** One head's facts: its due time (ISO timestamptz) and when it closed, if it has. */
export type HeadFacts = { closesAt: string; closedAt: string | null };

/** Who speaks: the party member about their own row, the quest's Giver, or the clock. */
export type Speaker = { partyMember: string } | { giver: string } | "clock";

/** What a party member may say about their own row. */
export type PartyMemberSays = { say: "turn_in"; text?: string; url?: string };
/** What the Giver may say about one row on their quest. */
export type GiverSays = { say: "react"; line: string } | { say: "close" };
/** What the clock says, once a head's due time has passed. */
export type ClockSays = { say: "close" };

/** The quest_party columns a decision writes. */
export type PartyPatch = {
  standing?: Standing;
  accepted_at?: string;
  turned_in_at?: string;
  late?: boolean;
  missed_at?: string;
  turn_in_text?: string | null;
  turn_in_url?: string | null;
  /** The reminder's claim (QS.2; the working day before since AK.5): set once, before the reminder is sent, and never cleared. */
  reminded_at?: string;
};

/** The quest_heads column a decision writes: the head closes. */
export type HeadPatch = { closed_at: string };

/** The quests columns a decision writes: the quest closes or is withdrawn. */
export type QuestPatch = { state: "closed"; closed_at: string } | { state: "withdrawn"; withdrawn_at: string };

/** One decision's writes, each applied by the writer to its own row. */
export type Write = { party?: PartyPatch; head?: HeadPatch; quest?: QuestPatch; reaction?: { line: string } };

export type Decision = { write: Write } | { refuse: string } | { keep: true };

const NOT_FOUND = "That ask was not found.";
const WITHDRAWN = "This ask was withdrawn, so there is nothing to answer.";
const GIVER_ONLY = "Only the person who asked can do that.";

/**
 * Whether the head has stopped expecting Turn-ins: it was closed, or its due
 * time is behind us. The second half matters between the due time and the
 * clock's run, so a Turn-in in that gap is late too.
 */
export function hasClosed(head: HeadFacts, now: Date): boolean {
  return head.closedAt !== null || now.getTime() >= Date.parse(head.closesAt);
}

/** A head's facts from its quest_heads columns, so each read maps them one way. */
export function headFactsOf(row: { closes_at: string; closed_at: string | null }): HeadFacts {
  return { closesAt: row.closes_at, closedAt: row.closed_at };
}

/**
 * Whether a page draws a head as closed: it has closed, or its quest is no
 * longer open. A withdrawn quest's heads may be before their due time, but
 * they take no more answers, so they read as closed too.
 */
export function headShownClosed(questState: QuestState, head: HeadFacts, now: Date): boolean {
  return questState !== "open" || hasClosed(head, now);
}

/** The Standings of a row still out: the person has not answered the head yet. */
export const STILL_OUT = ["called", "accepted"] as const satisfies readonly Standing[];

/**
 * Whether the reader still owes an answer on a head: they are Called on it or
 * Accepted it, and it is open on an open quest. A hand-back is an answer and a
 * Missed belongs to a head that has closed, so neither is owed, even though
 * both may still turn in. The assistant's "what is open for me" and the page's
 * Next move both ask this, so they list the same heads.
 */
export function headOwed(standing: Standing, questState: QuestState, head: HeadFacts, now: Date): boolean {
  return questState === "open" && (STILL_OUT as readonly Standing[]).includes(standing) && !hasClosed(head, now);
}

/** Whether decide would take a party member's one move, the Turn-in, on their own row of one head. */
export type OpenMoves = { turnIn: boolean };

const NO_MOVES: OpenMoves = { turnIn: false };

/**
 * The move open to a party member on their own row of one head, as decide
 * gates it. decide reads this for the Turn-in, so a button drawn from it is
 * one the server will take; only the checks on what was written (an empty
 * Turn-in, a bad link) stay in decide, because no button can know them in
 * advance.
 *
 * - Nothing is open on a withdrawn quest.
 * - A Turn-in is open on every row not already turned in, on a closed head as
 *   on an open one, and on a closed quest: after the close it is late and
 *   counts in full. That includes a person the Quests page left Handed back
 *   (Khoa, 15 November 2026): they may still turn in once the head has closed,
 *   like anyone still out.
 *
 * The head and the time no longer matter: the move that closed with the head,
 * the hand-back, went with AK.12.
 */
export function openMoves(standing: Standing, quest: Pick<QuestFacts, "state">): OpenMoves {
  if (quest.state === "withdrawn") return NO_MOVES;
  return { turnIn: standing !== "turned_in" };
}

/**
 * Whether a row still out becomes Missed when its head closes. On a required
 * Bounty everyone still out does. On an optional one only a person who opted
 * in by accepting does; someone still Called never said yes, so the close
 * leaves them Called and they are not counted on that head. Raids and Beacons
 * never write a Missed: a seat nobody took is not one, and who came to a Raid
 * is Training's register.
 *
 * The reminder the working day before (AK.5, clock-rules.ts owedReminder) goes
 * on a required Bounty only, and there it asks this same question of a row
 * still out, so on a required ask the people reminded are exactly the people a
 * close would mark. An Accepted row on an optional Bounty is still marked
 * Missed with no reminder; only the retired Quests page wrote one, since the
 * Asks page has no Accept, its action went with AK.10 and the move with AK.11.
 */
export function owesMissed(row: Pick<PartyRow, "standing">, quest: Pick<QuestFacts, "kind" | "required">): boolean {
  if (quest.kind !== "bounty") return false;
  if (row.standing === "accepted") return true;
  return quest.required && row.standing === "called";
}

function partyMemberDecides(row: PartyRow, quest: QuestFacts, head: HeadFacts, personId: string, says: PartyMemberSays, now: Date): Decision {
  if (row.personId !== personId) return { refuse: NOT_FOUND };
  if (quest.state === "withdrawn") return { refuse: WITHDRAWN };
  // The Turn-in writes only when openMoves says it is open, so a button drawn
  // from openMoves and this answer cannot drift. The refusals are in the Asks
  // page's words (ADR 0036).
  if (!openMoves(row.standing, quest).turnIn) return { refuse: "You answered this one already." };
  const at = now.toISOString();
  const text = says.text?.trim() || null;
  const url = says.url?.trim() || null;
  if (quest.kind === "beacon" && !url) return { refuse: "A Beacon is turned in with a link to the public thing." };
  if (!text && !url) return { refuse: "Write your answer first." };
  if (url && !/^https?:\/\/\S+$/i.test(url)) return { refuse: "A link starts with http:// or https://." };
  // Turning in counts as accepting, so an accept that never happened is
  // stamped now; one that did keeps its time.
  return {
    write: {
      party: { standing: "turned_in", turned_in_at: at, accepted_at: row.acceptedAt ?? at, late: row.standing === "missed" || hasClosed(head, now), turn_in_text: text, turn_in_url: url },
    },
  };
}

/** A head's close reaching one row: the row still out becomes Missed when it owes one. */
function closes(row: PartyRow, quest: QuestFacts, now: Date): Decision {
  return owesMissed(row, quest) ? { write: { party: { standing: "missed", missed_at: now.toISOString() } } } : { keep: true };
}

function giverDecides(row: PartyRow, quest: QuestFacts, giverId: string, says: GiverSays, now: Date): Decision {
  if (quest.giverId !== giverId) return { refuse: GIVER_ONLY };
  switch (says.say) {
    case "react": {
      if (row.personId === giverId) return { refuse: "You can't thank your own answer." };
      if (row.standing !== "turned_in") return { refuse: "There is no answer to thank yet." };
      if (row.reacted) return { refuse: "You thanked this answer already." };
      const line = says.line.trim();
      if (!line) return { refuse: "Write a line first." };
      return { write: { reaction: { line } } };
    }
    case "close": {
      if (quest.state === "withdrawn") return { refuse: "A withdrawn ask cannot be closed." };
      return closes(row, quest, now);
    }
  }
}

function clockDecides(row: PartyRow, quest: QuestFacts, head: HeadFacts, now: Date): Decision {
  // A withdrawn quest has no Missed, and a head before its due time is open.
  if (quest.state === "withdrawn" || !hasClosed(head, now)) return { keep: true };
  return closes(row, quest, now);
}

/**
 * Decides one move on one party row. A party member says turn_in about their
 * own row; the Giver says react or close; the clock says
 * close. The overloads make any other pairing a type error.
 */
export function decide(row: PartyRow, quest: QuestFacts, head: HeadFacts, speaker: { partyMember: string }, says: PartyMemberSays, now: Date): Decision;
export function decide(row: PartyRow, quest: QuestFacts, head: HeadFacts, speaker: { giver: string }, says: GiverSays, now: Date): Decision;
export function decide(row: PartyRow, quest: QuestFacts, head: HeadFacts, speaker: "clock", says: ClockSays, now: Date): Decision;
export function decide(row: PartyRow, quest: QuestFacts, head: HeadFacts, speaker: Speaker, says: PartyMemberSays | GiverSays | ClockSays, now: Date): Decision {
  if (speaker === "clock") return clockDecides(row, quest, head, now);
  if ("partyMember" in speaker) return partyMemberDecides(row, quest, head, speaker.partyMember, says as PartyMemberSays, now);
  return giverDecides(row, quest, speaker.giver, says as GiverSays, now);
}

/**
 * Whether one head closes: early by the Giver (stamped now), or by the clock
 * once its due time has passed (stamped with the due time, which is when it
 * closed). Returns keep for a head already closed or still before its time.
 */
export function closeHead(quest: QuestFacts, head: HeadFacts, speaker: { giver: string } | "clock", now: Date): Decision {
  if (speaker !== "clock" && quest.giverId !== speaker.giver) return { refuse: GIVER_ONLY };
  if (quest.state === "withdrawn") return speaker === "clock" ? { keep: true } : { refuse: "A withdrawn ask cannot be closed." };
  if (head.closedAt !== null) return { keep: true };
  if (speaker === "clock") return hasClosed(head, now) ? { write: { head: { closed_at: head.closesAt } } } : { keep: true };
  return { write: { head: { closed_at: now.toISOString() } } };
}

/**
 * The quest closes with its last head: an open quest whose every head has
 * closed (or passed its due time) becomes closed, stamped now. Null when
 * nothing changes. The writer asks this after applying the heads' closes.
 */
export function closesQuest(quest: QuestFacts, heads: readonly HeadFacts[], now: Date): QuestPatch | null {
  if (quest.state !== "open" || heads.length === 0) return null;
  return heads.every((h) => hasClosed(h, now)) ? { state: "closed", closed_at: now.toISOString() } : null;
}

/**
 * The Giver withdraws their quest. Every Standing stays as it is: Turn-ins stay
 * with their authors and nobody becomes Missed.
 */
export function withdraw(quest: QuestFacts, heads: readonly HeadFacts[], giverId: string, now: Date): Decision {
  if (quest.giverId !== giverId) return { refuse: GIVER_ONLY };
  if (quest.state !== "open") return { refuse: "Only an open ask can be withdrawn." };
  // Once a head's due time is behind us that head closes, by the clock or by
  // the Giver; withdrawing then would unwrite the Missed the close owes.
  if (heads.some((h) => hasClosed(h, now))) return { refuse: "Its due time has passed, so close it instead of withdrawing it." };
  return { write: { quest: { state: "withdrawn", withdrawn_at: now.toISOString() } } };
}

/**
 * Whether a reader may see everyone a quest called (ADR 0020, as amended for
 * QS.10): they gave it, and it is required, which records that they were a
 * manager or an admin when they summoned it, so no role is looked up. The
 * Quests page asks it for the Giver's own party and the manager report asks it
 * beside the reader's quests.report reach, so the two audiences cannot
 * disagree about who the Giver sees. It is about one quest, never a person's
 * quests taken together.
 */
export function seesWhoWasCalled(quest: { required: boolean; giver_id: string }, readerPersonId: string | null): boolean {
  return quest.required && readerPersonId !== null && quest.giver_id === readerPersonId;
}

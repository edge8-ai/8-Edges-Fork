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
// The rules, from the grilling, the approved prototype and Khoa's 20 October
// changes:
//
//   Optional Bounty                          Required Bounty
//   Called ──accept──▶ Accepted              Accepted (being called is the commitment)
//     │                 │                      │
//     │                 ├─turn in─▶ Turned in  ├─turn in─▶ Turned in
//     │                 ├─hand back─▶ Handed   └─(head closes)─▶ Missed
//     │                 │             back
//     │                 └─(head closes)─▶ Missed
//     ├─turn in─▶ Turned in (turning in counts as accepting)
//     ├─hand back─▶ Handed back (declining; the note is optional)
//     └─(head closes)─▶ stays Called: never opted in, so not Missed
//   Missed ──turn in (late)──▶ Turned in, late = true
//   Any ──(quest withdrawn)──▶ Standing kept; nobody becomes Missed
//
// - A Turn-in after its head's due time, or on a closed head, is taken,
//   recorded as late, and lifts a Missed. It counts in full.
// - Accepting and handing back are open only while the head is: once it has
//   closed, the one move left is a late Turn-in (ADR 0020).
// - A required Bounty cannot be handed back. On an optional one a hand-back
//   needs no note, and it is refused after a Turn-in.
// - Closing early is the Giver's and closes every open head the way the due
//   time does. A quest closes when its last head has.
// - Withdrawing keeps every Standing and never writes a Missed; it is refused
//   once any head's due time has passed, because the Missed that head owes
//   would be unwritten.
// - Only the Giver may close, withdraw or react; a Reaction needs a Turn-in.
// - A party member speaks only about their own row.

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
 * manager or an admin when they summoned it. giverName lets a refusal name the
 * person whose ask it is; without it the refusal says "your Giver".
 */
export type QuestFacts = { kind: QuestKind; state: QuestState; giverId: string; required: boolean; giverName?: string };

/** One head's facts: its due time (ISO timestamptz) and when it closed, if it has. */
export type HeadFacts = { closesAt: string; closedAt: string | null };

/** Who speaks: the party member about their own row, the quest's Giver, or the clock. */
export type Speaker = { partyMember: string } | { giver: string } | "clock";

/** What a party member may say about their own row. */
export type PartyMemberSays = { say: "accept" } | { say: "turn_in"; text?: string; url?: string } | { say: "hand_back"; note: string };
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
  handed_back_at?: string;
  missed_at?: string;
  turn_in_text?: string | null;
  turn_in_url?: string | null;
  note?: string | null;
  /** The two-hour reminder's claim (QS.2): set once, before the reminder is sent, and never cleared. */
  reminded_at?: string;
};

/** The quest_heads column a decision writes: the head closes. */
export type HeadPatch = { closed_at: string };

/** The quests columns a decision writes: the quest closes or is withdrawn. */
export type QuestPatch = { state: "closed"; closed_at: string } | { state: "withdrawn"; withdrawn_at: string };

/** One decision's writes, each applied by the writer to its own row. */
export type Write = { party?: PartyPatch; head?: HeadPatch; quest?: QuestPatch; reaction?: { line: string } };

export type Decision = { write: Write } | { refuse: string } | { keep: true };

const NOT_FOUND = "That quest was not found.";
const WITHDRAWN = "This quest was withdrawn, so there is nothing to answer.";
const CLOSED = "This head has closed. You can still turn in.";
const GIVER_ONLY = "Only the quest's Giver may do that.";

/**
 * Whether the head has stopped expecting Turn-ins: it was closed, or its due
 * time is behind us. The second half matters between the due time and the
 * clock's run, so a Turn-in in that gap is late too.
 */
export function hasClosed(head: HeadFacts, now: Date): boolean {
  return head.closedAt !== null || now.getTime() >= Date.parse(head.closesAt);
}

/**
 * Whether a row still out becomes Missed when its head closes. On a required
 * Bounty everyone still out does. On an optional one only a person who opted
 * in by accepting does; someone still Called never said yes, so the close
 * leaves them Called and they are not counted on that head. Raids and Beacons
 * never write a Missed: a seat nobody took is not one, and who came to a Raid
 * is Training's register.
 *
 * The two-hour reminder (QS.2, clock-rules.ts) asks the same question of a row
 * still out, so the people reminded are exactly the people a close would mark.
 */
export function owesMissed(row: Pick<PartyRow, "standing">, quest: Pick<QuestFacts, "kind" | "required">): boolean {
  if (quest.kind !== "bounty") return false;
  if (row.standing === "accepted") return true;
  return quest.required && row.standing === "called";
}

function partyMemberDecides(row: PartyRow, quest: QuestFacts, head: HeadFacts, personId: string, says: PartyMemberSays, now: Date): Decision {
  if (row.personId !== personId) return { refuse: NOT_FOUND };
  if (quest.state === "withdrawn") return { refuse: WITHDRAWN };
  const at = now.toISOString();
  switch (says.say) {
    case "accept": {
      // On a required Bounty every row starts accepted, so there is nothing to do.
      if (quest.required || row.standing === "accepted" || row.standing === "turned_in") return { keep: true };
      if (hasClosed(head, now)) return { refuse: CLOSED };
      return { write: { party: { standing: "accepted", accepted_at: at } } };
    }
    case "turn_in": {
      if (row.standing === "turned_in") return { refuse: "You turned this one in already." };
      const text = says.text?.trim() || null;
      const url = says.url?.trim() || null;
      if (quest.kind === "beacon" && !url) return { refuse: "A Beacon is turned in with a link to the public thing." };
      if (!text && !url) return { refuse: "Write something to turn in." };
      if (url && !/^https?:\/\/\S+$/i.test(url)) return { refuse: "A link starts with http:// or https://." };
      // Turning in counts as accepting, so an accept that never happened is
      // stamped now; one that did keeps its time.
      return {
        write: {
          party: { standing: "turned_in", turned_in_at: at, accepted_at: row.acceptedAt ?? at, late: row.standing === "missed" || hasClosed(head, now), turn_in_text: text, turn_in_url: url },
        },
      };
    }
    case "hand_back": {
      if (quest.required) {
        return { refuse: `This one is from ${quest.giverName?.trim() || "your Giver"}, and it's required; turn it in, late if you must.` };
      }
      if (row.standing === "turned_in") return { refuse: "You turned this one in, so it cannot be handed back." };
      if (row.standing === "handed_back") return { refuse: "You handed this one back already." };
      if (hasClosed(head, now)) return { refuse: CLOSED };
      // Declining from Called is an honourable answer and needs no explanation;
      // handing back a head you had accepted does, because the Giver was
      // counting on you. A note that is only spaces is stored as none.
      if (row.standing === "accepted" && !says.note.trim()) return { refuse: "Say a word to the Giver when you hand it back." };
      const note = says.note.trim() || null;
      return { write: { party: { standing: "handed_back", handed_back_at: at, note } } };
    }
  }
}

/** A head's close reaching one row: the row still out becomes Missed when it owes one. */
function closes(row: PartyRow, quest: QuestFacts, now: Date): Decision {
  return owesMissed(row, quest) ? { write: { party: { standing: "missed", missed_at: now.toISOString() } } } : { keep: true };
}

function giverDecides(row: PartyRow, quest: QuestFacts, giverId: string, says: GiverSays, now: Date): Decision {
  if (quest.giverId !== giverId) return { refuse: GIVER_ONLY };
  switch (says.say) {
    case "react": {
      if (row.personId === giverId) return { refuse: "A Reaction is for someone else's Turn-in." };
      if (row.standing !== "turned_in") return { refuse: "A Reaction needs a Turn-in." };
      if (row.reacted) return { refuse: "You reacted to this Turn-in already." };
      const line = says.line.trim();
      if (!line) return { refuse: "Write a line to react." };
      return { write: { reaction: { line } } };
    }
    case "close": {
      if (quest.state === "withdrawn") return { refuse: "A withdrawn quest cannot be closed." };
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
 * Decides one move on one party row. A party member says accept, turn_in or
 * hand_back about their own row; the Giver says react or close; the clock says
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
  if (quest.state === "withdrawn") return speaker === "clock" ? { keep: true } : { refuse: "A withdrawn quest cannot be closed." };
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
  if (quest.state !== "open") return { refuse: "Only an open quest can be withdrawn." };
  // Once a head's due time is behind us that head closes, by the clock or by
  // the Giver; withdrawing then would unwrite the Missed the close owes.
  if (heads.some((h) => hasClosed(h, now))) return { refuse: "A due time has passed, so this quest closes instead of being withdrawn." };
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

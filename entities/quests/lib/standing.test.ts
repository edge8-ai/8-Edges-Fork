import { describe, expect, it } from "vitest";
import {
  closeHead,
  closesQuest,
  decide,
  hasClosed,
  seesWhoWasCalled,
  withdraw,
  type Decision,
  type HeadFacts,
  type PartyRow,
  type QuestFacts,
} from "./standing";

// Every move on a Standing goes through one pure step (QS.1). These cases play
// the spec's diagram (docs/engineering/2026-10-20-quests-spec.md, "The pure
// core: standing" and "Heads") the way attendance-word.test.ts plays words on
// a register: a sequence of moves, each asserting the write or the refusal.

// The giver asks for one takeaway, due Friday 24 October at 17:00 Saigon. The
// optional Bounty is the ordinary case; REQUIRED is the same ask from a manager.
const BOUNTY: QuestFacts = { kind: "bounty", state: "open", giverId: "giver", required: false, giverName: "Dave" };
const REQUIRED: QuestFacts = { ...BOUNTY, required: true };
const HEAD: HeadFacts = { closesAt: "2026-10-24T10:00:00.000Z", closedAt: null };
const ROW: PartyRow = { personId: "member", headId: "head-1", standing: "called", late: false, reacted: false, acceptedAt: null, turnedInAt: null, handedBackAt: null, missedAt: null };
// Wednesday afternoon in Saigon.
const WEDNESDAY = new Date("2026-10-22T08:00:00Z");
// Friday 16:59 in Saigon: still before the due time.
const FRIDAY_BEFORE = new Date("2026-10-24T09:59:00Z");
// Friday 17:30 in Saigon: the due time is behind us.
const FRIDAY_AFTER = new Date("2026-10-24T10:30:00Z");
const MAI = { partyMember: "member" } as const;
const DAVE = { giver: "giver" } as const;

/** Applies a decision's writes to a row and its head, so a sequence of moves can be played. */
function after(row: PartyRow, head: HeadFacts, d: Decision): [PartyRow, HeadFacts] {
  if (!("write" in d)) return [row, head];
  const p = d.write.party ?? {};
  const next: PartyRow = {
    ...row,
    standing: p.standing ?? row.standing,
    late: p.late ?? row.late,
    reacted: row.reacted || Boolean(d.write.reaction),
    acceptedAt: p.accepted_at ?? row.acceptedAt,
    turnedInAt: p.turned_in_at ?? row.turnedInAt,
    handedBackAt: p.handed_back_at ?? row.handedBackAt,
    missedAt: p.missed_at ?? row.missedAt,
  };
  return [next, d.write.head ? { ...head, closedAt: d.write.head.closed_at } : head];
}

describe("hasClosed: a head stops expecting Turn-ins at its due time", () => {
  it("is open before the due time, closed at it and after, and closed once closed early", () => {
    expect(hasClosed(HEAD, FRIDAY_BEFORE)).toBe(false);
    expect(hasClosed(HEAD, new Date(HEAD.closesAt))).toBe(true);
    expect(hasClosed(HEAD, FRIDAY_AFTER)).toBe(true);
    expect(hasClosed({ ...HEAD, closedAt: WEDNESDAY.toISOString() }, WEDNESDAY)).toBe(true);
  });
});

describe("decide: Called, Accepted, Turned in", () => {
  it("accepts, then takes the Turn-in, keeping the time of the accept", () => {
    const accepted = decide(ROW, BOUNTY, HEAD, MAI, { say: "accept" }, WEDNESDAY);
    expect(accepted).toEqual({ write: { party: { standing: "accepted", accepted_at: WEDNESDAY.toISOString() } } });
    const [row] = after(ROW, HEAD, accepted);
    const turnedIn = decide(row, BOUNTY, HEAD, MAI, { say: "turn_in", text: "Prompt caching halves the bill." }, FRIDAY_BEFORE);
    expect(turnedIn).toEqual({
      write: { party: { standing: "turned_in", turned_in_at: FRIDAY_BEFORE.toISOString(), accepted_at: WEDNESDAY.toISOString(), late: false, turn_in_text: "Prompt caching halves the bill.", turn_in_url: null } },
    });
  });

  it("counts a Turn-in from Called as accepting, stamping the accept with it", () => {
    expect(decide(ROW, BOUNTY, HEAD, MAI, { say: "turn_in", text: "One takeaway" }, WEDNESDAY)).toMatchObject({
      write: { party: { standing: "turned_in", accepted_at: WEDNESDAY.toISOString(), turned_in_at: WEDNESDAY.toISOString(), late: false } },
    });
  });

  it("keeps a second accept, and an accept after a Turn-in, as nothing to do", () => {
    expect(decide({ ...ROW, standing: "accepted" }, BOUNTY, HEAD, MAI, { say: "accept" }, WEDNESDAY)).toEqual({ keep: true });
    expect(decide({ ...ROW, standing: "turned_in" }, BOUNTY, HEAD, MAI, { say: "accept" }, WEDNESDAY)).toEqual({ keep: true });
  });

  it("refuses a second Turn-in and an empty one", () => {
    expect(decide({ ...ROW, standing: "turned_in" }, BOUNTY, HEAD, MAI, { say: "turn_in", text: "again" }, WEDNESDAY)).toEqual({ refuse: "You turned this one in already." });
    expect(decide(ROW, BOUNTY, HEAD, MAI, { say: "turn_in", text: "   " }, WEDNESDAY)).toEqual({ refuse: "Write something to turn in." });
  });

  it("takes a link, and refuses one that is not a web address", () => {
    expect(decide(ROW, BOUNTY, HEAD, MAI, { say: "turn_in", url: "https://example.com/post" }, WEDNESDAY)).toMatchObject({ write: { party: { turn_in_url: "https://example.com/post", turn_in_text: null } } });
    expect(decide(ROW, BOUNTY, HEAD, MAI, { say: "turn_in", url: "example.com" }, WEDNESDAY)).toEqual({ refuse: "A link starts with http:// or https://." });
  });

  it("lights a Beacon only with a link to the public thing", () => {
    const beacon: QuestFacts = { kind: "beacon", state: "open", giverId: "member", required: false };
    expect(decide(ROW, beacon, HEAD, MAI, { say: "turn_in", text: "I posted it" }, WEDNESDAY)).toEqual({ refuse: "A Beacon is turned in with a link to the public thing." });
    expect(decide(ROW, beacon, HEAD, MAI, { say: "turn_in", url: "https://www.linkedin.com/posts/x" }, WEDNESDAY)).toMatchObject({ write: { party: { standing: "turned_in" } } });
  });
});

describe("decide: Handed back on an optional Bounty", () => {
  it("hands back from Called or Accepted, with a note to the Giver", () => {
    expect(decide(ROW, BOUNTY, HEAD, MAI, { say: "hand_back", note: "On leave this week." }, WEDNESDAY)).toEqual({
      write: { party: { standing: "handed_back", handed_back_at: WEDNESDAY.toISOString(), note: "On leave this week." } },
    });
    expect(decide({ ...ROW, standing: "accepted" }, BOUNTY, HEAD, MAI, { say: "hand_back", note: "Ran out of week." }, WEDNESDAY)).toMatchObject({ write: { party: { standing: "handed_back" } } });
  });

  it("declines without a note, storing none", () => {
    expect(decide(ROW, BOUNTY, HEAD, MAI, { say: "hand_back", note: "" }, WEDNESDAY)).toEqual({
      write: { party: { standing: "handed_back", handed_back_at: WEDNESDAY.toISOString(), note: null } },
    });
    expect(decide(ROW, BOUNTY, HEAD, MAI, { say: "hand_back", note: "   " }, WEDNESDAY)).toMatchObject({ write: { party: { note: null } } });
    // Handing back a head you had accepted is different: the Giver was counting on you, so it needs a word.
    expect(decide({ ...ROW, standing: "accepted" }, BOUNTY, HEAD, MAI, { say: "hand_back", note: "  " }, WEDNESDAY)).toEqual({ refuse: "Say a word to the Giver when you hand it back." });
  });

  it("is refused after a Turn-in, and a second time", () => {
    expect(decide({ ...ROW, standing: "turned_in" }, BOUNTY, HEAD, MAI, { say: "hand_back", note: "Never mind" }, WEDNESDAY)).toEqual({ refuse: "You turned this one in, so it cannot be handed back." });
    expect(decide({ ...ROW, standing: "handed_back" }, BOUNTY, HEAD, MAI, { say: "hand_back", note: "A longer note" }, WEDNESDAY)).toEqual({ refuse: "You handed this one back already." });
  });

  it("leaves the door open: a person who handed back may still accept or turn in while the head is open", () => {
    const back = { ...ROW, standing: "handed_back" as const };
    expect(decide(back, BOUNTY, HEAD, MAI, { say: "accept" }, WEDNESDAY)).toMatchObject({ write: { party: { standing: "accepted" } } });
    expect(decide(back, BOUNTY, HEAD, MAI, { say: "turn_in", text: "Found the time" }, WEDNESDAY)).toMatchObject({ write: { party: { standing: "turned_in", late: false } } });
  });
});

describe("decide: a required Bounty", () => {
  const accepted: PartyRow = { ...ROW, standing: "accepted", acceptedAt: WEDNESDAY.toISOString() };

  it("has no Accept move: accepting is nothing to do, because being called is the commitment", () => {
    expect(decide(accepted, REQUIRED, HEAD, MAI, { say: "accept" }, WEDNESDAY)).toEqual({ keep: true });
  });

  it("refuses a hand-back, naming whose ask it is, from any Standing", () => {
    const refusal = { refuse: "This one is from Dave, and it's required; turn it in, late if you must." };
    expect(decide(accepted, REQUIRED, HEAD, MAI, { say: "hand_back", note: "Busy" }, WEDNESDAY)).toEqual(refusal);
    expect(decide({ ...accepted, standing: "missed" }, REQUIRED, HEAD, MAI, { say: "hand_back", note: "" }, FRIDAY_AFTER)).toEqual(refusal);
    expect(decide(accepted, { ...REQUIRED, giverName: undefined }, HEAD, MAI, { say: "hand_back", note: "" }, WEDNESDAY)).toEqual({
      refuse: "This one is from your Giver, and it's required; turn it in, late if you must.",
    });
  });

  it("makes everyone still out Missed when the head closes, and a late Turn-in lifts it", () => {
    const closed = decide(accepted, REQUIRED, HEAD, "clock", { say: "close" }, FRIDAY_AFTER);
    expect(closed).toEqual({ write: { party: { standing: "missed", missed_at: FRIDAY_AFTER.toISOString() } } });
    const [missed] = after(accepted, HEAD, closed);
    expect(decide(missed, REQUIRED, HEAD, MAI, { say: "turn_in", text: "Late" }, FRIDAY_AFTER)).toMatchObject({ write: { party: { standing: "turned_in", late: true } } });
  });

  it("would still miss a row left Called, though a required Bounty never writes one", () => {
    expect(decide(ROW, REQUIRED, HEAD, "clock", { say: "close" }, FRIDAY_AFTER)).toMatchObject({ write: { party: { standing: "missed" } } });
  });
});

describe("decide: an optional Bounty's head closes", () => {
  it("leaves a row still Called as Called: it never opted in, so it is not Missed", () => {
    expect(decide(ROW, BOUNTY, HEAD, "clock", { say: "close" }, FRIDAY_AFTER)).toEqual({ keep: true });
    expect(decide(ROW, BOUNTY, HEAD, DAVE, { say: "close" }, WEDNESDAY)).toEqual({ keep: true });
  });

  it("makes an accepted row still out Missed", () => {
    const accepted = { ...ROW, standing: "accepted" as const };
    expect(decide(accepted, BOUNTY, HEAD, "clock", { say: "close" }, FRIDAY_AFTER)).toEqual({ write: { party: { standing: "missed", missed_at: FRIDAY_AFTER.toISOString() } } });
  });

  it("leaves Turned in and Handed back alone", () => {
    for (const standing of ["turned_in", "handed_back"] as const) {
      expect(decide({ ...ROW, standing }, BOUNTY, HEAD, "clock", { say: "close" }, FRIDAY_AFTER)).toEqual({ keep: true });
    }
  });
});

describe("decide: the head closes, then a late Turn-in lifts the Missed", () => {
  it("is a sequence: Mai accepts, the due time passes, the clock closes, she turns in that evening", () => {
    const [accepted] = after(ROW, HEAD, decide(ROW, BOUNTY, HEAD, MAI, { say: "accept" }, WEDNESDAY));
    // A minute before the due time the clock does nothing.
    expect(decide(accepted, BOUNTY, HEAD, "clock", { say: "close" }, FRIDAY_BEFORE)).toEqual({ keep: true });
    expect(closeHead(BOUNTY, HEAD, "clock", FRIDAY_BEFORE)).toEqual({ keep: true });
    const headClosed = closeHead(BOUNTY, HEAD, "clock", FRIDAY_AFTER);
    // The clock stamps the head with its due time, which is when it closed.
    expect(headClosed).toEqual({ write: { head: { closed_at: HEAD.closesAt } } });
    const [, head] = after(accepted, HEAD, headClosed);
    const closed = decide(accepted, BOUNTY, head, "clock", { say: "close" }, FRIDAY_AFTER);
    const [missed] = after(accepted, head, closed);
    expect(missed.standing).toBe("missed");
    const late = decide(missed, BOUNTY, head, MAI, { say: "turn_in", text: "Late, but here it is." }, new Date("2026-10-24T14:00:00Z"));
    expect(late).toMatchObject({ write: { party: { standing: "turned_in", late: true, accepted_at: WEDNESDAY.toISOString() } } });
    const [lifted] = after(missed, head, late);
    expect(lifted.standing).toBe("turned_in");
    // The Missed is lifted, and its time stays as history.
    expect(lifted.missedAt).toBe(FRIDAY_AFTER.toISOString());
  });

  it("marks a Turn-in late once the due time is behind us, even before the clock has run", () => {
    expect(decide(ROW, BOUNTY, HEAD, MAI, { say: "turn_in", text: "Just after" }, FRIDAY_AFTER)).toMatchObject({ write: { party: { late: true } } });
    expect(decide(ROW, BOUNTY, HEAD, MAI, { say: "turn_in", text: "Just before" }, FRIDAY_BEFORE)).toMatchObject({ write: { party: { late: false } } });
  });

  it("refuses an accept or a hand-back once the head has closed: the one move left is a late Turn-in", () => {
    const missed = { ...ROW, standing: "missed" as const, missedAt: FRIDAY_AFTER.toISOString() };
    expect(decide(missed, BOUNTY, HEAD, MAI, { say: "accept" }, FRIDAY_AFTER)).toEqual({ refuse: "This head has closed. You can still turn in." });
    expect(decide(missed, BOUNTY, HEAD, MAI, { say: "hand_back", note: "Sorry" }, FRIDAY_AFTER)).toEqual({ refuse: "This head has closed. You can still turn in." });
  });
});

describe("heads: each closes on its own, and the quest closes with its last", () => {
  const FIRST: HeadFacts = { closesAt: "2026-10-22T10:00:00.000Z", closedAt: null };
  const SECOND: HeadFacts = HEAD;

  it("closes the first head and keeps the quest open while the second is", () => {
    const thursday = new Date("2026-10-23T03:00:00Z");
    expect(closeHead(BOUNTY, FIRST, "clock", thursday)).toEqual({ write: { head: { closed_at: FIRST.closesAt } } });
    expect(closeHead(BOUNTY, SECOND, "clock", thursday)).toEqual({ keep: true });
    expect(closesQuest(BOUNTY, [{ ...FIRST, closedAt: FIRST.closesAt }, SECOND], thursday)).toBeNull();
  });

  it("closes the quest when its last head has", () => {
    expect(closesQuest(BOUNTY, [FIRST, SECOND], FRIDAY_AFTER)).toEqual({ state: "closed", closed_at: FRIDAY_AFTER.toISOString() });
    expect(closesQuest({ ...BOUNTY, state: "closed" }, [FIRST, SECOND], FRIDAY_AFTER)).toBeNull();
    expect(closesQuest(BOUNTY, [], FRIDAY_AFTER)).toBeNull();
  });

  it("keeps a Standing per head: a row on a closed head is Missed while the same person's open head is untouched", () => {
    const onFirst = { ...ROW, headId: "head-1", standing: "accepted" as const };
    const onSecond = { ...ROW, headId: "head-2", standing: "accepted" as const };
    const thursday = new Date("2026-10-23T03:00:00Z");
    expect(decide(onFirst, BOUNTY, FIRST, "clock", { say: "close" }, thursday)).toMatchObject({ write: { party: { standing: "missed" } } });
    expect(decide(onSecond, BOUNTY, SECOND, "clock", { say: "close" }, thursday)).toEqual({ keep: true });
  });
});

describe("the Giver closes early", () => {
  it("closes every open head now, the same way the due time does", () => {
    expect(closeHead(BOUNTY, HEAD, DAVE, WEDNESDAY)).toEqual({ write: { head: { closed_at: WEDNESDAY.toISOString() } } });
    expect(decide({ ...ROW, standing: "accepted" }, BOUNTY, HEAD, DAVE, { say: "close" }, WEDNESDAY)).toEqual({
      write: { party: { standing: "missed", missed_at: WEDNESDAY.toISOString() } },
    });
    expect(closeHead(BOUNTY, { ...HEAD, closedAt: WEDNESDAY.toISOString() }, DAVE, WEDNESDAY)).toEqual({ keep: true });
  });

  it("is the Giver's alone", () => {
    expect(closeHead(BOUNTY, HEAD, { giver: "member" }, WEDNESDAY)).toEqual({ refuse: "Only the quest's Giver may do that." });
    expect(decide(ROW, BOUNTY, HEAD, { giver: "member" }, { say: "close" }, WEDNESDAY)).toEqual({ refuse: "Only the quest's Giver may do that." });
  });
});

describe("withdraw", () => {
  it("keeps every Standing, writes no Missed, and marks the quest withdrawn", () => {
    expect(withdraw(BOUNTY, [HEAD], "giver", WEDNESDAY)).toEqual({ write: { quest: { state: "withdrawn", withdrawn_at: WEDNESDAY.toISOString() } } });
  });

  it("leaves nobody Missed when a due time passes afterwards", () => {
    const withdrawn = { ...BOUNTY, state: "withdrawn" as const };
    const accepted = { ...ROW, standing: "accepted" as const };
    expect(decide(accepted, withdrawn, HEAD, "clock", { say: "close" }, FRIDAY_AFTER)).toEqual({ keep: true });
    expect(closeHead(withdrawn, HEAD, "clock", FRIDAY_AFTER)).toEqual({ keep: true });
    expect(decide(accepted, withdrawn, HEAD, DAVE, { say: "close" }, FRIDAY_AFTER)).toEqual({ refuse: "A withdrawn quest cannot be closed." });
    expect(closeHead(withdrawn, HEAD, DAVE, FRIDAY_AFTER)).toEqual({ refuse: "A withdrawn quest cannot be closed." });
  });

  it("takes no more answers on a withdrawn quest", () => {
    const withdrawn = { ...BOUNTY, state: "withdrawn" as const };
    expect(decide(ROW, withdrawn, HEAD, MAI, { say: "turn_in", text: "too late" }, WEDNESDAY)).toEqual({ refuse: "This quest was withdrawn, so there is nothing to answer." });
  });

  it("is open only to the Giver, and only while the quest is open", () => {
    expect(withdraw(BOUNTY, [HEAD], "admin", WEDNESDAY)).toEqual({ refuse: "Only the quest's Giver may do that." });
    expect(withdraw({ ...BOUNTY, state: "closed" }, [HEAD], "giver", WEDNESDAY)).toEqual({ refuse: "Only an open quest can be withdrawn." });
  });

  it("is refused once any head's due time has passed, so the Missed it owes is not unwritten", () => {
    const early: HeadFacts = { closesAt: "2026-10-22T10:00:00.000Z", closedAt: null };
    expect(withdraw(BOUNTY, [early, HEAD], "giver", WEDNESDAY)).toMatchObject({ write: { quest: { state: "withdrawn" } } });
    expect(withdraw(BOUNTY, [early, HEAD], "giver", new Date("2026-10-23T00:00:00Z"))).toEqual({
      refuse: "A due time has passed, so this quest closes instead of being withdrawn.",
    });
  });
});

describe("decide: a Raid's or a Beacon's close writes no Missed", () => {
  const RAID: QuestFacts = { kind: "raid", state: "open", giverId: "giver", required: false };
  it("leaves an untaken seat as it was: who came is Training's register", () => {
    expect(decide(ROW, RAID, HEAD, "clock", { say: "close" }, FRIDAY_AFTER)).toEqual({ keep: true });
    expect(decide({ ...ROW, standing: "accepted" }, RAID, HEAD, DAVE, { say: "close" }, WEDNESDAY)).toEqual({ keep: true });
  });
});

describe("decide: a Reaction", () => {
  const turnedIn = { ...ROW, standing: "turned_in" as const, turnedInAt: WEDNESDAY.toISOString() };

  it("is the Giver's line on a Turn-in", () => {
    expect(decide(turnedIn, BOUNTY, HEAD, DAVE, { say: "react", line: "This one made my week." }, WEDNESDAY)).toEqual({ write: { reaction: { line: "This one made my week." } } });
  });

  it("needs a Turn-in, a line, and comes once", () => {
    expect(decide(ROW, BOUNTY, HEAD, DAVE, { say: "react", line: "Nice" }, WEDNESDAY)).toEqual({ refuse: "A Reaction needs a Turn-in." });
    expect(decide(turnedIn, BOUNTY, HEAD, DAVE, { say: "react", line: " " }, WEDNESDAY)).toEqual({ refuse: "Write a line to react." });
    expect(decide({ ...turnedIn, reacted: true }, BOUNTY, HEAD, DAVE, { say: "react", line: "Again" }, WEDNESDAY)).toEqual({ refuse: "You reacted to this Turn-in already." });
  });

  it("is refused to anyone but the Giver, and to the Giver on their own Turn-in", () => {
    expect(decide(turnedIn, BOUNTY, HEAD, { giver: "admin" }, { say: "react", line: "Nice" }, WEDNESDAY)).toEqual({ refuse: "Only the quest's Giver may do that." });
    expect(decide({ ...turnedIn, personId: "giver" }, BOUNTY, HEAD, DAVE, { say: "react", line: "Me" }, WEDNESDAY)).toEqual({ refuse: "A Reaction is for someone else's Turn-in." });
  });
});

describe("decide: a party member speaks only about their own row", () => {
  it("refuses a move on someone else's row", () => {
    expect(decide(ROW, BOUNTY, HEAD, { partyMember: "manager" }, { say: "accept" }, WEDNESDAY)).toEqual({ refuse: "That quest was not found." });
    expect(decide(ROW, BOUNTY, HEAD, { partyMember: "manager" }, { say: "turn_in", text: "for Mai" }, WEDNESDAY)).toEqual({ refuse: "That quest was not found." });
  });

  it("makes a party member's close, or the clock's Turn-in, a type error", () => {
    // @ts-expect-error only the Giver or the clock closes a head
    decide(ROW, BOUNTY, HEAD, MAI, { say: "close" }, WEDNESDAY);
    // @ts-expect-error the clock never turns in for anyone
    decide(ROW, BOUNTY, HEAD, "clock", { say: "turn_in", text: "x" }, WEDNESDAY);
    // @ts-expect-error the Giver reacts; they never accept on someone's behalf
    decide(ROW, BOUNTY, HEAD, DAVE, { say: "accept" }, WEDNESDAY);
    expect(true).toBe(true);
  });
});

// Who sees a Missed, and on which audience, is ADR 0020's matrix in
// quest-report.test.ts. This is the one piece both the Quests page and the
// report ask: the Giver of a required Bounty sees everyone they called.
describe("seesWhoWasCalled", () => {
  const quest = (required: boolean) => ({ required, giver_id: "giver" });

  it.each([
    ["the Giver of a required Bounty", quest(true), "giver", true],
    ["the Giver of an optional Bounty", quest(false), "giver", false],
    ["someone else on a required Bounty", quest(true), "peer", false],
    ["a reader with no person record", quest(true), null, false],
  ] as const)("%s: %s", (_who, q, reader, sees) => {
    expect(seesWhoWasCalled(q, reader)).toBe(sees);
  });
});

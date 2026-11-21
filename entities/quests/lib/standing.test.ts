import { describe, expect, it } from "vitest";
import {
  closeHead,
  closesQuest,
  decide,
  hasClosed,
  headFactsOf,
  headOwed,
  headShownClosed,
  openMoves,
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
const BOUNTY: QuestFacts = { kind: "bounty", state: "open", giverId: "giver", required: false };
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
  it("takes the Turn-in on an Accepted row, keeping the time of the accept", () => {
    const row: PartyRow = { ...ROW, standing: "accepted", acceptedAt: WEDNESDAY.toISOString() };
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

  it("refuses a second Turn-in and an empty one", () => {
    expect(decide({ ...ROW, standing: "turned_in" }, BOUNTY, HEAD, MAI, { say: "turn_in", text: "again" }, WEDNESDAY)).toEqual({ refuse: "You answered this one already." });
    expect(decide(ROW, BOUNTY, HEAD, MAI, { say: "turn_in", text: "   " }, WEDNESDAY)).toEqual({ refuse: "Write your answer first." });
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

describe("decide: a Handed back row the Quests page wrote", () => {
  // No ask can be declined since AK.12, so no new row becomes Handed back. The
  // rows the retired Quests page left keep the one move everyone has.
  it("may still turn in while the head is open, on time", () => {
    const back = { ...ROW, standing: "handed_back" as const };
    expect(decide(back, BOUNTY, HEAD, MAI, { say: "turn_in", text: "Found the time" }, WEDNESDAY)).toMatchObject({ write: { party: { standing: "turned_in", late: false } } });
  });
});

describe("decide: a required Bounty", () => {
  const accepted: PartyRow = { ...ROW, standing: "accepted", acceptedAt: WEDNESDAY.toISOString() };

  // Khoa, 17 November 2026: "Required ask can not be declined. It's a task, if
  // you missed the deadline, it's recorded and it will affect you." There is no
  // decline to say (the type pin is under "a party member speaks only about
  // their own row"), so a required row never becomes Handed back, and what
  // records a missed deadline is the close below.
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
  it("is a sequence: Mai has accepted, the due time passes, the clock closes, she turns in that evening", () => {
    const accepted: PartyRow = { ...ROW, standing: "accepted", acceptedAt: WEDNESDAY.toISOString() };
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

  // Khoa, 15 November 2026 (A.96): a person the Quests page left Handed back may
  // still turn in once the head has closed, recorded as late, the same as anyone
  // still out.
  it("takes a Turn-in from a person who handed back once the head has closed, recorded as late", () => {
    const back: PartyRow = { ...ROW, standing: "handed_back", handedBackAt: WEDNESDAY.toISOString() };
    const turnIn = { say: "turn_in", text: "Found the time after all" } as const;
    const late = { write: { party: { standing: "turned_in", late: true, turned_in_at: FRIDAY_AFTER.toISOString(), accepted_at: FRIDAY_AFTER.toISOString() } } };
    // Past the due time, before the clock has stamped the head.
    expect(decide(back, BOUNTY, HEAD, MAI, turnIn, FRIDAY_AFTER)).toMatchObject(late);
    // The clock or the Giver has closed the head.
    expect(decide(back, BOUNTY, { ...HEAD, closedAt: HEAD.closesAt }, MAI, turnIn, FRIDAY_AFTER)).toMatchObject(late);
    // The quest itself has closed with its last head.
    expect(decide(back, { ...BOUNTY, state: "closed" }, { ...HEAD, closedAt: HEAD.closesAt }, MAI, turnIn, FRIDAY_AFTER)).toMatchObject(late);
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
    expect(closeHead(BOUNTY, HEAD, { giver: "member" }, WEDNESDAY)).toEqual({ refuse: "Only the person who asked can do that." });
    expect(decide(ROW, BOUNTY, HEAD, { giver: "member" }, { say: "close" }, WEDNESDAY)).toEqual({ refuse: "Only the person who asked can do that." });
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
    expect(decide(accepted, withdrawn, HEAD, DAVE, { say: "close" }, FRIDAY_AFTER)).toEqual({ refuse: "A withdrawn ask cannot be closed." });
    expect(closeHead(withdrawn, HEAD, DAVE, FRIDAY_AFTER)).toEqual({ refuse: "A withdrawn ask cannot be closed." });
  });

  it("takes no more answers on a withdrawn quest", () => {
    const withdrawn = { ...BOUNTY, state: "withdrawn" as const };
    expect(decide(ROW, withdrawn, HEAD, MAI, { say: "turn_in", text: "too late" }, WEDNESDAY)).toEqual({ refuse: "This ask was withdrawn, so there is nothing to answer." });
  });

  it("is open only to the Giver, and only while the quest is open", () => {
    expect(withdraw(BOUNTY, [HEAD], "admin", WEDNESDAY)).toEqual({ refuse: "Only the person who asked can do that." });
    expect(withdraw({ ...BOUNTY, state: "closed" }, [HEAD], "giver", WEDNESDAY)).toEqual({ refuse: "Only an open ask can be withdrawn." });
  });

  it("is refused once any head's due time has passed, so the Missed it owes is not unwritten", () => {
    const early: HeadFacts = { closesAt: "2026-10-22T10:00:00.000Z", closedAt: null };
    expect(withdraw(BOUNTY, [early, HEAD], "giver", WEDNESDAY)).toMatchObject({ write: { quest: { state: "withdrawn" } } });
    expect(withdraw(BOUNTY, [early, HEAD], "giver", new Date("2026-10-23T00:00:00Z"))).toEqual({
      refuse: "Its due time has passed, so close it instead of withdrawing it.",
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
    expect(decide(ROW, BOUNTY, HEAD, DAVE, { say: "react", line: "Nice" }, WEDNESDAY)).toEqual({ refuse: "There is no answer to thank yet." });
    expect(decide(turnedIn, BOUNTY, HEAD, DAVE, { say: "react", line: " " }, WEDNESDAY)).toEqual({ refuse: "Write a line first." });
    expect(decide({ ...turnedIn, reacted: true }, BOUNTY, HEAD, DAVE, { say: "react", line: "Again" }, WEDNESDAY)).toEqual({ refuse: "You thanked this answer already." });
  });

  it("is refused to anyone but the Giver, and to the Giver on their own Turn-in", () => {
    expect(decide(turnedIn, BOUNTY, HEAD, { giver: "admin" }, { say: "react", line: "Nice" }, WEDNESDAY)).toEqual({ refuse: "Only the person who asked can do that." });
    expect(decide({ ...turnedIn, personId: "giver" }, BOUNTY, HEAD, DAVE, { say: "react", line: "Me" }, WEDNESDAY)).toEqual({ refuse: "You can't thank your own answer." });
  });
});

describe("decide: a party member speaks only about their own row", () => {
  it("refuses a move on someone else's row", () => {
    expect(decide(ROW, BOUNTY, HEAD, { partyMember: "manager" }, { say: "turn_in", text: "for Mai" }, WEDNESDAY)).toEqual({ refuse: "That ask was not found." });
  });

  it("makes a party member's close, the clock's Turn-in, and anyone's accept or hand-back a type error", () => {
    // @ts-expect-error only the Giver or the clock closes a head
    decide(ROW, BOUNTY, HEAD, MAI, { say: "close" }, WEDNESDAY);
    // @ts-expect-error the clock never turns in for anyone
    decide(ROW, BOUNTY, HEAD, "clock", { say: "turn_in", text: "x" }, WEDNESDAY);
    // @ts-expect-error the Giver reacts; they never answer on someone's behalf
    decide(ROW, BOUNTY, HEAD, DAVE, { say: "turn_in", text: "x" }, WEDNESDAY);
    // @ts-expect-error nobody accepts any more: the move retired with AK.11
    decide(ROW, BOUNTY, HEAD, MAI, { say: "accept" }, WEDNESDAY);
    // @ts-expect-error nobody hands back any more: the move retired with AK.12
    decide(ROW, BOUNTY, HEAD, MAI, { say: "hand_back", note: "On leave this week." }, WEDNESDAY);
    expect(true).toBe(true);
  });
});

// decide takes the Turn-in exactly when openMoves says it is open (A.96). These
// cases pin the table; the property below plays every Standing on every kind of
// head through both and asks them to agree.
describe("openMoves: the move a party member may make on one head", () => {
  const CLOSED_HEAD: HeadFacts = { ...HEAD, closedAt: HEAD.closesAt };

  it("offers a Turn-in on every row not yet turned in, required or optional, on an open quest or a closed one", () => {
    for (const standing of ["called", "accepted", "handed_back", "missed"] as const) {
      expect(openMoves(standing, BOUNTY)).toEqual({ turnIn: true });
      expect(openMoves(standing, REQUIRED)).toEqual({ turnIn: true });
      expect(openMoves(standing, { ...BOUNTY, state: "closed" })).toEqual({ turnIn: true });
    }
  });

  it("offers nothing after a Turn-in or on a withdrawn quest", () => {
    expect(openMoves("turned_in", BOUNTY)).toEqual({ turnIn: false });
    expect(openMoves("accepted", { ...BOUNTY, state: "withdrawn" })).toEqual({ turnIn: false });
  });

  it("agrees with decide on every Standing, quest and head: the Turn-in is open exactly when decide would write it", () => {
    const standings = ["called", "accepted", "turned_in", "handed_back", "missed"] as const;
    const quests: QuestFacts[] = [BOUNTY, REQUIRED, { ...BOUNTY, state: "closed" }, { ...BOUNTY, state: "withdrawn" }];
    const heads: [HeadFacts, Date][] = [[HEAD, WEDNESDAY], [HEAD, FRIDAY_AFTER], [CLOSED_HEAD, FRIDAY_AFTER]];
    for (const standing of standings) {
      for (const quest of quests) {
        for (const [head, now] of heads) {
          const row = { ...ROW, standing };
          const expected = { turnIn: "write" in decide(row, quest, head, MAI, { say: "turn_in", text: "x" }, now) };
          expect({ standing, quest: quest.state, required: quest.required, closed: hasClosed(head, now), ...openMoves(standing, quest) }).toEqual({
            standing, quest: quest.state, required: quest.required, closed: hasClosed(head, now), ...expected,
          });
        }
      }
    }
  });
});

describe("headOwed: a head the reader still owes an answer on", () => {
  it("is a Called or Accepted row on an open head of an open quest", () => {
    expect(headOwed("called", "open", HEAD, WEDNESDAY)).toBe(true);
    expect(headOwed("accepted", "open", HEAD, WEDNESDAY)).toBe(true);
  });

  it("is not a row already answered, a closed head, or a quest no longer open", () => {
    for (const standing of ["turned_in", "handed_back", "missed"] as const) expect(headOwed(standing, "open", HEAD, WEDNESDAY)).toBe(false);
    expect(headOwed("accepted", "open", HEAD, FRIDAY_AFTER)).toBe(false);
    expect(headOwed("accepted", "closed", HEAD, WEDNESDAY)).toBe(false);
    expect(headOwed("accepted", "withdrawn", HEAD, WEDNESDAY)).toBe(false);
  });
});

describe("headShownClosed and headFactsOf", () => {
  it("draws a head closed once it has closed, or once its quest is no longer open", () => {
    const row = { closes_at: HEAD.closesAt, closed_at: null };
    expect(headFactsOf(row)).toEqual(HEAD);
    expect(headShownClosed("open", headFactsOf(row), WEDNESDAY)).toBe(false);
    expect(headShownClosed("open", headFactsOf(row), FRIDAY_AFTER)).toBe(true);
    expect(headShownClosed("withdrawn", headFactsOf(row), WEDNESDAY)).toBe(true);
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

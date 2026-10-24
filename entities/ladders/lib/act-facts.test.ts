import { describe, expect, it } from "vitest";
import { gatherActFacts } from "./act-facts";
import { MATE, ME, attended, given, hit, quest, spark, sparkCard } from "./badge-fixtures";
import { memoryDoors } from "./testing";

// gatherActFacts with fake doors (LD.7): each door question is asked once for
// everyone in the batch; the second questions (a hosted Raid's register, the
// Host of a Raid sat in, the cards picked up from a spark) are asked once
// with the ids the first answers named; and each person gets their own facts
// and nobody else's.

const OTHER = "person-other";

describe("gatherActFacts", () => {
  it("asks each door once however many people are gathered", async () => {
    const raid = quest({ kind: "raid", giverId: ME, hostId: ME, trainingId: "t-mine" });
    const sat = attended({ trainingId: "t-theirs" });
    const mine = spark({ kind: "build" });
    const doors = memoryDoors({
      questFacts: { [ME]: { party: [hit()], given: [given()], hosted: [raid], reactionsGiven: [], reactionsReceived: [] } },
      sparkFacts: { [ME]: { sparks: [mine], marksGiven: [], buildNotes: [], heldReceived: [] } },
      trainingFacts: { [OTHER]: { attended: [sat], submissions: [], reviews: [], recaps: [], selfLogged: [] } },
      registers: { "t-mine": { held: true, selfLogged: false, attended: [ME, MATE] } },
      raidHosts: { "t-theirs": MATE },
      sparkCards: [sparkCard(mine.id, MATE), sparkCard("idea-of-someone", MATE)],
    });
    const out = await gatherActFacts([ME, MATE, OTHER], doors, new Map([[ME, { learnSharePoints: 10, builderPoints: 0, learnShare: "iron", builder: "herald" }]]));
    expect(doors.calls).toMatchObject({ questFactsOf: 1, sparkFactsOf: 1, shippedCardFactsOf: 1, trainingFactsOf: 1, sessionRegisters: 1, raidHostsOf: 1, cardsFromSparks: 1 });

    const me = out.get(ME);
    expect(me?.quests.party).toHaveLength(1);
    expect(me?.hostedRaids).toEqual([{ quest: raid, trainingId: "t-mine", held: true, selfLogged: false, attended: [ME, MATE] }]);
    // Only the cards picked up from the person's own sparks are theirs to be told about.
    expect(me?.sparkCards.map((c) => c.ideaId)).toEqual([mine.id]);
    expect(me?.ladders.learnSharePoints).toBe(10);

    const other = out.get(OTHER);
    expect(other?.raidHosts.get("t-theirs")).toBe(MATE);
    expect(other?.quests.party).toEqual([]);
    // A person the recompute did not place is at the bottom of both ladders.
    expect(other?.ladders).toEqual({ learnSharePoints: 0, builderPoints: 0, learnShare: "iron", builder: "herald" });
  });

  it("does not ask the second questions when the first answers name nothing", async () => {
    const doors = memoryDoors({});
    await gatherActFacts([ME], doors);
    expect(doors.calls).toMatchObject({ sessionRegisters: 0, raidHostsOf: 0, cardsFromSparks: 0 });
  });

  it("reads a Raid with no session, or one Training no longer knows, as not held", async () => {
    const cold = quest({ kind: "raid", hostId: ME, trainingId: null });
    const gone = quest({ kind: "raid", hostId: ME, trainingId: "t-gone" });
    const doors = memoryDoors({ questFacts: { [ME]: { party: [], given: [], hosted: [cold, gone], reactionsGiven: [], reactionsReceived: [] } } });
    const out = await gatherActFacts([ME], doors);
    expect(out.get(ME)?.hostedRaids.map((r) => r.held)).toEqual([false, false]);
  });
});

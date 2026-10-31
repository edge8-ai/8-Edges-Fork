import { describe, expect, it } from "vitest";
import { gatherActFacts } from "./act-facts";
import { MATE, ME, attended, given, hit, hosted, spark, sparkCard } from "./badge-fixtures";
import { memoryDoors } from "./testing";

// gatherActFacts with fake doors (LD.7): each door question is asked once for
// everyone in the batch; the second questions (the Host of a Raid sat in, the
// cards picked up from a spark) are asked once with the ids the first answers
// named; and each person gets their own facts and nobody else's. A hosted
// Raid arrives from Quests already judged (ADR 0023), so no register is asked.

const OTHER = "person-other";

describe("gatherActFacts", () => {
  it("asks each door once however many people are gathered", async () => {
    const raid = hosted([ME, MATE]);
    const sat = attended({ trainingId: "t-theirs" });
    const mine = spark({ kind: "build" });
    const doors = memoryDoors({
      questFacts: { [ME]: { party: [hit()], given: [given()], hosted: [raid], reactionsGiven: [], reactionsReceived: [] } },
      sparkFacts: { [ME]: { sparks: [mine], marksGiven: [], buildNotes: [], heldReceived: [] } },
      trainingFacts: { [OTHER]: { attended: [sat], submissions: [], reviews: [], recaps: [], selfLogged: [] } },
      raidHosts: { "t-theirs": MATE },
      sparkCards: [sparkCard(mine.id, MATE), sparkCard("idea-of-someone", MATE)],
    });
    const out = await gatherActFacts([ME, MATE, OTHER], doors, new Map([[ME, { learnSharePoints: 10, builderPoints: 0, learnShare: "iron", builder: "herald" }]]));
    expect(doors.calls).toEqual({ questFactsOf: 1, sparkFactsOf: 1, shippedCardFactsOf: 1, trainingFactsOf: 1, raidHostsOf: 1, cardsFromSparks: 1 });

    const me = out.get(ME);
    expect(me?.quests.party).toHaveLength(1);
    expect(me?.quests.hosted).toEqual([raid]);
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
    expect(doors.calls).toMatchObject({ raidHostsOf: 0, cardsFromSparks: 0 });
  });
});

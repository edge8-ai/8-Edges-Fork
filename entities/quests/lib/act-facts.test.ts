import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The ladders' second question of Quests (LD.7): a person's accepted and
// turned-in party rows with their quests, the quests they gave, and the
// Reactions on those Turn-ins. The read never asks for a row that was handed
// back, called and left, or missed, so no badge can rest on one.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

const { questFactsOf } = await import("./act-facts");

beforeEach(() => resetFake());

const quest = (id: string, giver: string, over: Record<string, unknown> = {}) => ({ id, kind: "bounty", state: "open", giver_id: giver, host_id: null, learning: false, required: false, training_id: null, created_at: "2026-10-20T03:00:00Z", ...over });

describe("questFactsOf", () => {
  it("asks only for party rows accepted or turned in, and draws each quest's monster as the Quests page does", async () => {
    script(
      "quest_party",
      // The person's own rows.
      { data: [{ id: "p1", quest_id: "q1", head_id: "h1", person_id: "me", standing: "turned_in", accepted_at: null, turn_in_url: null, turned_in_at: "2026-10-21T03:00:00Z", created_at: "2026-10-20T03:00:00Z" }] },
      // Who is in each Party.
      {
        data: [
          { id: "p1", quest_id: "q1", person_id: "me" },
          { id: "p2", quest_id: "q1", person_id: "mate" },
          { id: "p3", quest_id: "q2", person_id: "mate" },
        ],
      },
    );
    script("quests", { data: [quest("q2", "me")] }, { data: [] }, { data: [quest("q1", "mate")] });
    script("quest_heads", {
      data: [
        { id: "h1", quest_id: "q1" },
        { id: "h2", quest_id: "q1" },
        { id: "h3", quest_id: "q2" },
      ],
    });
    script("quest_reactions", {
      data: [
        { id: "r1", quest_id: "q2", party_id: "p3", created_at: "2026-10-22T03:00:00Z" },
        { id: "r2", quest_id: "q1", party_id: "p1", created_at: "2026-10-22T04:00:00Z" },
      ],
    });

    const me = (await questFactsOf(["me"])).get("me");

    const own = calls.find((c) => c.table === "quest_party");
    expect(own?.filters).toEqual(expect.arrayContaining([["in", "standing", ["accepted", "turned_in"]]]));
    expect(me?.party).toHaveLength(1);
    expect(me?.party[0].quest).toMatchObject({ id: "q1", headIds: ["h1", "h2"], partySize: 2, monster: "hydra", giverId: "mate" });
    expect(me?.given.map((q) => [q.id, q.monster, q.partySize])).toEqual([["q2", "slime", 1]]);
    expect(me?.reactionsGiven).toEqual([{ id: "r1", questId: "q2", giverId: "me", turnInBy: "mate", at: "2026-10-22T03:00:00Z" }]);
    expect(me?.reactionsReceived).toEqual([{ id: "r2", questId: "q1", giverId: "mate", turnInBy: "me", at: "2026-10-22T04:00:00Z" }]);
  });

  it("answers empty lists for a person who did nothing, asking nothing more once the first reads are empty", async () => {
    script("quest_party", { data: [] });
    script("quests", { data: [] }, { data: [] });
    expect((await questFactsOf(["me"])).get("me")).toEqual({ party: [], given: [], hosted: [], reactionsGiven: [], reactionsReceived: [] });
    expect(calls.map((c) => c.table)).toEqual(["quest_party", "quests", "quests"]);
  });
});

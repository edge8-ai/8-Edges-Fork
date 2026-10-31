import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import type { LoreEntry } from "./lore";

// Evolve's read (QS.7): only the reader's own learnings are asked about, so
// the page never carries an Evolve state for anyone else's; each state comes
// from the quests grown from the learning and, for a fire, from Training's
// register through its door.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const SESSIONS: Record<string, { endsAt: string; cancelled: boolean }> = {
  burning: { endsAt: "2026-10-30T09:20:00Z", cancelled: false },
  held: { endsAt: "2026-10-14T09:20:00Z", cancelled: false },
  cancelled: { endsAt: "2026-10-30T09:20:00Z", cancelled: true },
};
const ATTENDED: Record<string, string[]> = { held: ["kim", "mai", "lan"] };
const asked: string[][] = [];
vi.mock("@/entities/training", () => ({
  taughtSessions: async (ids: readonly string[]) => (asked.push([...ids]), new Map(ids.filter((id) => SESSIONS[id]).map((id) => [id, SESSIONS[id]]))),
  sessionRegisters: async (ids: readonly string[]) => new Map(ids.map((id) => [id, { held: true, selfLogged: false, attended: ATTENDED[id] ?? [] }])),
}));

const { firesOn, readEvolve } = await import("./evolve-read");

const NOW = new Date("2026-10-24T03:00:00Z");
const kim = { personId: "kim", name: "Kim Dao", initials: "KD" };
const chi = { personId: "chi", name: "Chi Nguyen", initials: "CN" };
const entry = (id: string, mine: boolean, willTry: number): LoreEntry => ({ id, author: mine ? kim : chi, mine, title: `Learning ${id}`, postedAt: "2026-10-20T00:00:00Z", willTry, youWillTry: false });
const raid = (id: string, idea: string, training: string, host = "kim") => ({ id, kind: "raid", title: `Fire ${id}`, giver_id: host, host_id: host, training_id: training, origin_idea_id: idea, created_at: "2026-10-21T00:00:00Z" });

beforeEach(() => {
  resetFake();
  asked.length = 0;
});

describe("readEvolve", () => {
  it("asks nothing when none of the learnings is the reader's", async () => {
    expect(await readEvolve("kim", [entry("c1", false, 5)], NOW)).toEqual({});
    expect(calls).toEqual([]);
  });

  it("asks only about the reader's own learnings, and gives a state to none of anyone else's", async () => {
    script("quests", { data: [] });
    const value = await readEvolve("kim", [entry("k1", true, 3), entry("c1", false, 7)], NOW);
    expect(value).toEqual({ k1: { step: "fire", willTry: 3 } });
    const [read] = calls.filter((c) => c.table === "quests");
    expect(read?.filters).toContainEqual(["in", "origin_idea_id", ["k1"]]);
  });

  it("walks each learning to its state: lit, held with who sat by it, and the Beacon lit", async () => {
    script("quests", {
      data: [
        raid("r-burn", "k-lit", "burning"),
        raid("r-held", "k-held", "held"),
        raid("r-done", "k-done", "held"),
        { id: "b1", kind: "beacon", title: "The template, as a post", giver_id: "kim", host_id: null, training_id: null, origin_idea_id: "k-done", created_at: "2026-10-22T00:00:00Z" },
      ],
    });
    const value = await readEvolve("kim", [entry("k-lit", true, 1), entry("k-held", true, 4), entry("k-done", true, 6), entry("k-quiet", true, 2)], NOW);
    expect(value).toEqual({
      "k-lit": { step: "lit", questId: "r-burn" },
      "k-held": { step: "held", questId: "r-held", title: "Fire r-held", heldAt: "2026-10-14T09:20:00Z", sat: 2 },
      "k-done": { step: "beacon", questId: "b1" },
    });
  });

  it("does not count a Raid someone else hosts, nor a Beacon someone else lit", async () => {
    script("quests", {
      data: [raid("r-other", "k1", "burning", "chi"), { id: "b-other", kind: "beacon", title: "Not mine", giver_id: "chi", host_id: null, training_id: null, origin_idea_id: "k1", created_at: "2026-10-22T00:00:00Z" }],
    });
    expect(await readEvolve("kim", [entry("k1", true, 3)], NOW)).toEqual({ k1: { step: "fire", willTry: 3 } });
    expect(asked.flat()).toEqual([]);
  });

  it("raises on a failed read rather than hiding a fire the reader held", async () => {
    script("quests", { error: { message: "down" } });
    await expect(readEvolve("kim", [entry("k1", true, 3)], NOW)).rejects.toThrow();
  });
});

// The page's pill and the Evolve action's refusal count live fires from the
// same read and the same rule (QS.7 review): the page offers a fire again
// exactly when the action would light one.
describe("the page and the action agree on which fires are live", () => {
  it("a Raid whose session was cancelled: the pill offers the fire again, and the action counts no live fire but finds the cold one to put out", async () => {
    script("quests", { data: [raid("r-cold", "k1", "cancelled")] }, { data: [raid("r-cold", "k1", "cancelled")] });
    expect(await readEvolve("kim", [entry("k1", true, 3)], NOW)).toEqual({ k1: { step: "fire", willTry: 3 } });
    expect(await firesOn("kim", "k1")).toEqual({ live: 0, cold: [{ id: "r-cold", state: "open", trainingId: "cancelled" }] });
  });

  it("a Raid still burning: the pill says lit, and the action counts it", async () => {
    script("quests", { data: [raid("r-burn", "k1", "burning")] }, { data: [raid("r-burn", "k1", "burning")] });
    expect(await readEvolve("kim", [entry("k1", true, 3)], NOW)).toEqual({ k1: { step: "lit", questId: "r-burn" } });
    expect(await firesOn("kim", "k1")).toEqual({ live: 1, cold: [] });
  });

  it("the action's count raises on a failed read rather than answering none", async () => {
    script("quests", { error: { message: "down" } });
    await expect(firesOn("kim", "k1")).rejects.toThrow();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The Campfires read (QS.5; spec "What the page never shows"): a wanted topic
// carries its words, its hand count and whether the reader's own hand is up,
// and nothing else. Serialised as the page receives it, it names nobody who
// raised a hand; the people it does name are a fire's Host and its seats.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const PEOPLE: Record<string, string> = { chi: "Chi Nguyen", lan: "Lan Anh Tran", vinh: "Vinh Pham", host: "Hoa Le", seat: "Duc Vo" };
const named: string[][] = [];
// t1 burns ahead; t-old ended a week ago with someone seated and nothing marked, organised by vinh.
const SESSIONS: Record<string, unknown> = {
  t1: { startsAt: "2026-10-30T09:00:00Z", endsAt: "2026-10-30T09:20:00Z", cancelled: false, organiserId: "host", organiserPage: "/team/training/sessions/t1", seated: ["seat"], marked: false },
  "t-old": { startsAt: "2026-10-16T09:00:00Z", endsAt: "2026-10-16T09:20:00Z", cancelled: false, organiserId: "vinh", organiserPage: "/team/training/sessions/t-old", seated: ["seat"], marked: false },
};
vi.mock("@/kernel/identity/team-people", () => ({
  peopleOnRecord: async (ids: string[]) => {
    named.push(ids);
    return new Map(ids.filter((id) => PEOPLE[id]).map((id) => [id, { name: PEOPLE[id], archived: false }]));
  },
}));
vi.mock("@/entities/training", () => ({
  taughtSessions: async (ids: readonly string[]) => new Map(ids.filter((id) => SESSIONS[id]).map((id) => [id, SESSIONS[id]])),
}));

const { readCampfires } = await import("./campfires-read");

beforeEach(() => {
  resetFake();
  named.length = 0;
});

const hand = (person: string, topic: string, at: string) => ({ person_id: person, topic, topic_key: "prompt evals", created_at: at });

describe("readCampfires", () => {
  it("returns three hands on prompt evals as a count, naming none of the three", async () => {
    script("quest_hands", { data: [hand("chi", "prompt evals", "2026-10-20T01:00:00Z"), hand("lan", "prompt evals", "2026-10-20T02:00:00Z"), hand("vinh", "Prompt  evals ", "2026-10-20T03:00:00Z")] });
    script("quests", { data: [{ id: "q1", title: "Supabase RLS", host_id: "host", training_id: "t1" }] }, { data: [] });
    const value = await readCampfires("vinh", new Date("2026-10-23T03:00:00Z"));
    expect(value.wanted).toEqual([{ key: "prompt evals", topic: "prompt evals", hands: 3, mine: true }]);
    const page = JSON.stringify(value);
    for (const who of ["chi", "lan", "Chi Nguyen", "Lan Anh Tran", "Vinh Pham"]) expect(page).not.toContain(who);
    // The hand raisers are never even asked for by name.
    expect(named.flat()).not.toEqual(expect.arrayContaining(["chi"]));
    expect(named.flat()).not.toEqual(expect.arrayContaining(["lan"]));
    expect(value.burning).toHaveLength(1);
    expect(value.burning[0]).toMatchObject({ host: { name: "Hoa Le" }, seats: 1, faces: [{ name: "Duc Vo" }] });
  });

  it("asks for the reader's own newest lit Raids beside everyone's, so their ended fire still to mark is drawn once (QS.5c)", async () => {
    const old = { id: "q-old", title: "Lark bots", host_id: "vinh", training_id: "t-old" };
    script("quest_hands", { data: [] });
    // Everyone's newest read carries it too; the reader's own read finds it even when others' newer fires crowd it out.
    script("quests", { data: [{ id: "q1", title: "Supabase RLS", host_id: "host", training_id: "t1" }, old] }, { data: [old] });
    const value = await readCampfires("vinh", new Date("2026-10-23T03:00:00Z"));
    expect(value.burning.map((f) => [f.questId, f.endedAt])).toEqual([
      ["q-old", "2026-10-16T09:20:00Z"],
      ["q1", null],
    ]);
    const own = calls.filter((c) => c.table === "quests")[1];
    expect(own?.filters).toEqual(expect.arrayContaining([["eq", "kind", "raid"], ["eq", "state", "open"], ["eq", "host_id", "vinh"]]));
  });

  it("raises when a read fails, rather than drawing an empty section", async () => {
    script("quest_hands", { error: { message: "down" } });
    script("quests", { data: [] }, { data: [] });
    await expect(readCampfires("vinh")).rejects.toThrow();
  });
});

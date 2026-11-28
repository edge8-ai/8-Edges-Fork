import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import { shapeWanted } from "./campfires-model";

// QS.5c, the Quests side of a cancel: training.session.cancelled puts out the
// Raid whose session it was, hosted by the organiser who cancelled, and hands
// its topic back to Wanted with its hands, by Quests' own rule for a fire that
// never happens. Over the house fake, so the reads' and writes' own filters
// are what is checked; the bus itself is the real one.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => undefined) }));
beforeEach(() => resetFake());
afterEach(() => vi.clearAllMocks());

const NOW = new Date("2026-10-26T02:00:00Z");
const EVENT = { trainingId: "t-fire", organiserId: "p-host" };
const writesTo = (table: string) => calls.filter((c) => c.table === table && c.ops.includes("update"));
const hand = (id: string, person: string) => ({ id, person_id: person, topic_key: "prompt evals" });

describe("a Training session cancelled", () => {
  it("withdraws the open Raid of that session and that Host, and only that one", async () => {
    const { onSessionCancelled } = await import("./subscriptions");
    script("quests", { data: [{ id: "q-fire", state: "open" }] }, { data: null });
    script("quest_hands", { data: [] });
    await onSessionCancelled(EVENT, NOW);
    const [read] = calls.filter((c) => c.table === "quests" && c.ops.includes("select"));
    expect(read?.filters).toEqual(expect.arrayContaining([["eq", "kind", "raid"], ["eq", "training_id", "t-fire"], ["eq", "host_id", "p-host"], ["in", "state", ["open", "withdrawn"]]]));
    const [write] = writesTo("quests");
    expect(write?.payloads[0]).toEqual({ state: "withdrawn", withdrawn_at: NOW.toISOString() });
    expect(write?.filters).toEqual([["eq", "id", "q-fire"], ["eq", "state", "open"]]);
  });

  it("hands the topic back to Wanted with its hands, as a fire that never happens leaves it", async () => {
    const { onSessionCancelled } = await import("./subscriptions");
    script("quests", { data: [{ id: "q-fire", state: "open" }] }, { data: null });
    script("quest_hands", { data: [hand("h1", "chi"), hand("h2", "lan"), hand("h3", "vinh")] }, { data: [] }, { data: null }, { data: null }, { data: null });
    await onSessionCancelled(EVENT, NOW);
    const back = writesTo("quest_hands");
    expect(back.map((w) => w.payloads[0])).toEqual([{ quest_id: null }, { quest_id: null }, { quest_id: null }]);
    expect(back.map((w) => w.filters)).toEqual(["h1", "h2", "h3"].map((id) => [["eq", "id", id], ["eq", "quest_id", "q-fire"]]));
    // What Wanted reads once those rows are back: the topic, with its three hands.
    const released = ["chi", "lan", "vinh"].map((p, n) => ({ person_id: p, topic: "prompt evals", topic_key: "prompt evals", created_at: `2026-10-20T0${n}:00:00Z` }));
    expect(shapeWanted(released, "lan")).toEqual([{ key: "prompt evals", topic: "prompt evals", hands: 3, mine: true }]);
  });

  it("keeps a person's newer wanted hand on the topic, and leaves their old one with the Raid", async () => {
    const { onSessionCancelled } = await import("./subscriptions");
    script("quests", { data: [{ id: "q-fire", state: "open" }] }, { data: null });
    script("quest_hands", { data: [hand("h1", "chi"), hand("h2", "lan")] }, { data: [{ person_id: "lan", topic_key: "prompt evals" }] }, { data: null });
    await onSessionCancelled(EVENT, NOW);
    expect(writesTo("quest_hands").map((w) => w.filters[0])).toEqual([["eq", "id", "h1"]]);
  });

  it("finishes a cancel whose hands were not handed back, and writes nothing new once done", async () => {
    const { onSessionCancelled } = await import("./subscriptions");
    script("quests", { data: [{ id: "q-fire", state: "withdrawn" }] });
    script("quest_hands", { data: [hand("h1", "chi")] }, { data: [] }, { data: null });
    await onSessionCancelled(EVENT, NOW);
    expect(writesTo("quests")).toEqual([]);
    expect(writesTo("quest_hands")).toHaveLength(1);
    resetFake();
    script("quests", { data: [{ id: "q-fire", state: "withdrawn" }] });
    script("quest_hands", { data: [] });
    await onSessionCancelled(EVENT, NOW);
    expect([...writesTo("quests"), ...writesTo("quest_hands")]).toEqual([]);
  });

  it("touches nothing for a session that is no Raid's", async () => {
    const { onSessionCancelled } = await import("./subscriptions");
    script("quests", { data: [] });
    await onSessionCancelled(EVENT, NOW);
    expect(calls.filter((c) => c.ops.includes("update"))).toEqual([]);
  });

  it("raises when a write fails, for the bus to record", async () => {
    const { onSessionCancelled } = await import("./subscriptions");
    script("quests", { data: [{ id: "q-fire", state: "open" }] }, { error: { message: "down" } });
    await expect(onSessionCancelled(EVENT, NOW)).rejects.toThrow(/q-fire of session t-fire: down/);
  });

  it("is registered on the bus for training.session.cancelled, and a failure there never reaches the publisher", async () => {
    const { publish, resetSubscribers, subscribersOf } = await import("@/kernel/events");
    const { subscriptions } = await import("./subscriptions");
    resetSubscribers();
    subscriptions();
    expect(subscribersOf("training.session.cancelled")).toEqual(["quests"]);
    script("quests", { error: { message: "down" } });
    await expect(publish("training.session.cancelled", EVENT)).resolves.toBeUndefined();
    expect(calls.filter((c) => c.table === "quests")).toHaveLength(1);
    resetSubscribers();
  });
});

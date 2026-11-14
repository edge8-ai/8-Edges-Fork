import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script, tick, timeline } from "@/kernel/data/testing/fake-company-os";

// QS.5c, the Training side of a cancel: the one writer every cancel passes
// through (the organiser's page, the list, a Host's fire, Quests' undo of a
// half-lit fire) states training.session.cancelled after its write, so Quests
// can put out the Raid. Nothing is stated for a cancel refused or not saved.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const events: { at: number; label: string }[] = [];
const publish = vi.fn(async (name: string, _payload: unknown) => {
  events.push({ at: tick(), label: `publish:${name}` });
});
vi.mock("@/kernel/events", () => ({ publish: (name: string, payload: unknown) => publish(name, payload) }));
beforeEach(() => {
  resetFake();
  events.length = 0;
});
afterEach(() => vi.clearAllMocks());

const NOW = new Date("2026-10-26T02:00:00Z");
const FUTURE = "2026-10-30T09:00:00Z";
const own = (over: Record<string, unknown> = {}) => ({ data: [{ id: "t1", starts_at: FUTURE, cancelled_at: null, attendance: [], ...over }] });

describe("cancelTraining", () => {
  it("states the cancel after the write, naming the session and its organiser", async () => {
    const { cancelTraining } = await import("./trainings");
    script("trainings", own(), { data: [{ id: "t1" }] });
    expect(await cancelTraining("p-host", "t1", NOW)).toEqual({ ok: true });
    expect(publish).toHaveBeenCalledExactlyOnceWith("training.session.cancelled", { trainingId: "t1", organiserId: "p-host" });
    expect(timeline(events)).toEqual(["trainings:select", "trainings:update", "publish:training.session.cancelled"]);
  });

  it("states nothing for a cancel it refuses or could not save", async () => {
    const { cancelTraining } = await import("./trainings");
    script("trainings", { data: [] });
    expect(await cancelTraining("p-host", "t1", NOW)).toEqual({ ok: false, error: "That training was not found." });
    script("trainings", own({ starts_at: "2026-10-20T09:00:00Z" }));
    expect(await cancelTraining("p-host", "t1", NOW)).toEqual({ ok: false, error: "Only a training that has not started can be cancelled." });
    script("trainings", own(), { error: { message: "down" } });
    expect(await cancelTraining("p-host", "t1", NOW)).toEqual({ ok: false, error: "Could not cancel it. Try again." });
    expect(publish).not.toHaveBeenCalled();
    expect(calls.filter((c) => c.ops.includes("update"))).toHaveLength(1);
  });

  it("states a cancel once when two race: only the write that found the training still live", async () => {
    const { cancelTraining } = await import("./trainings");
    script("trainings", own(), { data: [{ id: "t1" }] }, own(), { data: [] });
    expect(await cancelTraining("p-host", "t1", NOW)).toEqual({ ok: true });
    expect(await cancelTraining("p-host", "t1", NOW)).toEqual({ ok: true });
    expect(publish).toHaveBeenCalledOnce();
    for (const w of calls.filter((c) => c.ops.includes("update"))) expect(w.filters).toContainEqual(["is", "cancelled_at", null]);
  });
});

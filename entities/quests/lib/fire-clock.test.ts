import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// ADR 0023: the quest clock states the moment a fire is held. Each tick asks
// Training which sessions ended in a window that overlaps the last tick, keeps
// the Raids among them, judges each with the one held rule, and states
// quest.fire.held for those held, so the Ladders credit the Host within a tick
// of the session's end and never before it.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/events", () => ({ publish: vi.fn(async () => undefined) }));
const door = vi.hoisted(() => ({
  ended: [] as string[],
  sessions: {} as Record<string, { endsAt: string; cancelled: boolean; attended: string[] }>,
  fail: null as string | null,
}));
vi.mock("@/entities/training", () => ({
  sessionsEndedBetween: vi.fn(async () => {
    if (door.fail) throw new Error(door.fail);
    return door.ended;
  }),
  taughtSessions: vi.fn(async (ids: readonly string[]) => new Map(ids.filter((id) => door.sessions[id]).map((id) => [id, { endsAt: door.sessions[id].endsAt, cancelled: door.sessions[id].cancelled }]))),
  sessionRegisters: vi.fn(async (ids: readonly string[]) => new Map(ids.filter((id) => door.sessions[id]).map((id) => [id, { held: true, selfLogged: false, attended: door.sessions[id].attended }]))),
}));

import { publish } from "@/kernel/events";
import { sessionsEndedBetween } from "@/entities/training";
import { FIRE_HELD_WINDOW_MS, stateHeldFires } from "./fire-clock";

const NOW = new Date("2026-10-28T10:05:00.000Z");
const ENDED = "2026-10-28T10:00:00.000Z";

beforeEach(() => {
  resetFake();
  door.ended = [];
  door.sessions = {};
  door.fail = null;
});
afterEach(() => vi.clearAllMocks());

const published = () => vi.mocked(publish).mock.calls.map(([name, payload]) => [name, payload]);

describe("stateHeldFires", () => {
  it("states quest.fire.held for each Raid whose session just ended with someone other than its Host attended, and for no other", async () => {
    door.ended = ["t-held", "t-alone", "t-class"];
    door.sessions = {
      "t-held": { endsAt: ENDED, cancelled: false, attended: ["host", "mai"] },
      "t-alone": { endsAt: ENDED, cancelled: false, attended: ["host"] },
      "t-class": { endsAt: ENDED, cancelled: false, attended: ["mai"] },
    };
    // t-class is a session no Raid was lit for.
    script("quests", {
      data: [
        { id: "q-held", host_id: "host", training_id: "t-held" },
        { id: "q-alone", host_id: "host", training_id: "t-alone" },
      ],
    });

    expect(await stateHeldFires(NOW)).toEqual({ held: 1, failures: [] });

    expect(published()).toEqual([["quest.fire.held", { questId: "q-held", hostId: "host" }]]);
    expect(vi.mocked(sessionsEndedBetween)).toHaveBeenCalledWith(new Date(NOW.getTime() - FIRE_HELD_WINDOW_MS), NOW);
    const read = calls.find((c) => c.table === "quests");
    expect(read?.filters).toEqual(expect.arrayContaining([["eq", "kind", "raid"], ["in", "training_id", ["t-held", "t-alone", "t-class"]]]));
  });

  it("looks back over two ticks, so a tick that ran late or failed is covered by the next", () => {
    expect(FIRE_HELD_WINDOW_MS).toBe(20 * 60_000);
  });

  it("reads no Raid when no session ended in the window", async () => {
    expect(await stateHeldFires(NOW)).toEqual({ held: 0, failures: [] });
    expect(calls).toEqual([]);
    expect(published()).toEqual([]);
  });

  it("reports a failed read as its step's failure and states nothing: the nightly replay repairs a missed fire", async () => {
    door.fail = "trainings down";
    expect(await stateHeldFires(NOW)).toEqual({ held: 0, failures: [{ subject: "held fires", step: "read", error: "trainings down" }] });
    expect(published()).toEqual([]);
  });
});

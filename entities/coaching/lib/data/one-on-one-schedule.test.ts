import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The 1-1 schedule's data half against the kernel fake (A.31.2): the batch
// read and the writes that record what a coach answered. The rules themselves
// are pinned in ../one-on-one-schedule.test.ts; this is the seam around them.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (t: string) => builderFor(t) } }));
const leaveByMember = new Map<string, { startDate: string; endDate: string }[]>();
vi.mock("./leave", () => ({
  getLeaveSpans: vi.fn(async () => []),
  getLeaveSpansByMember: vi.fn(async () => leaveByMember),
}));
vi.mock("@/entities/coaching/lib/transcript", () => ({ saveCoachingTranscript: vi.fn() }));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: () => "https://example.test" }));
vi.mock("@/entities/coaching/lib/cycle-shared", () => ({ notifyBoth: vi.fn(async () => true) }));
// data/shared.ts reaches boards' door for the commitment-card helpers; nothing
// under test calls them.
vi.mock("@/entities/boards", () => ({
  SUBJECT_COMMITMENT: "coaching_commitment",
  selectTasks: () => undefined,
  selectBoardMembers: () => undefined,
  selectBoardColumns: () => undefined,
  selectBoards: () => undefined,
  listActiveBoards: () => [],
}));

import { loadScheduleFor, loadSchedules } from "./one-on-one-schedule";
import { coachMarkOneOnOneHeld } from "./one-on-ones";
import { coachUndoMarkOneOnOneHeld } from "./row-bar";
import type { TeamActor } from "@/kernel/identity/team-auth";

const actor = { teamMemberId: "coach-1" } as TeamActor;
// Monday 28 September 2026, 10:00 in Saigon.
const NOW = new Date("2026-09-28T03:00:00Z");

beforeEach(() => {
  resetFake();
  leaveByMember.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

const row = (id: string, profile: string, day: string, status: string, movedFrom: string | null = null) => ({
  id,
  coaching_profile_id: profile,
  held_on: day,
  status,
  moved_from: movedFrom,
  starts_at: null,
  prep_markdown: null,
  prep_shared_markdown: null,
});

describe("loadSchedules", () => {
  it("answers every profile from one read of the 1-1s, however many there are", async () => {
    script("coaching_one_on_ones", {
      data: [
        row("a-held", "p-a", "2026-09-22", "held"),
        row("b-next", "p-b", "2026-10-01", "scheduled"),
        row("c-past", "p-c", "2026-09-23", "scheduled"),
      ],
    });

    const out = await loadSchedules(
      [
        { id: "p-a", teamMemberId: "tm-a", cadenceDays: 14, paused: false },
        { id: "p-b", teamMemberId: "tm-b", cadenceDays: 14, paused: false },
        { id: "p-c", teamMemberId: "tm-c", cadenceDays: 14, paused: false },
        { id: "p-d", teamMemberId: "tm-d", cadenceDays: 14, paused: false },
      ],
      "2026-09-28",
    );

    // Four profiles, one query: the roster asks about everyone on it.
    expect(calls.filter((c) => c.table === "coaching_one_on_ones")).toHaveLength(1);
    expect(out.get("p-a")).toMatchObject({ booked: null, awaiting: null, suggested: "2026-10-06" });
    expect(out.get("p-b")?.booked?.id).toBe("b-next");
    expect(out.get("p-c")?.awaiting?.id).toBe("c-past");
    // Never met: nothing booked and nothing suggested.
    expect(out.get("p-d")).toEqual({ booked: null, awaiting: null, suggested: null, lastOn: null, hasMet: false });
  });

  it("steps a suggestion over the member's own leave, and nobody else's", async () => {
    leaveByMember.set("tm-a", [{ startDate: "2026-10-05", endDate: "2026-10-07" }]);
    script("coaching_one_on_ones", {
      data: [row("a-held", "p-a", "2026-09-22", "held"), row("b-held", "p-b", "2026-09-22", "held")],
    });

    const out = await loadSchedules(
      [
        { id: "p-a", teamMemberId: "tm-a", cadenceDays: 14, paused: false },
        { id: "p-b", teamMemberId: "tm-b", cadenceDays: 14, paused: false },
      ],
      "2026-09-28",
    );

    expect(out.get("p-a")?.suggested).toBe("2026-10-13");
    expect(out.get("p-b")?.suggested).toBe("2026-10-06");
  });

  it("raises when the 1-1s cannot be read, rather than answering nothing booked", async () => {
    // "Nothing booked" beside a suggested day is exactly what a coach whose 1-1
    // IS on the calendar must never be told because a read failed.
    script("coaching_one_on_ones", { data: null, error: { message: "connection reset" } });
    await expect(
      loadSchedules([{ id: "p-a", teamMemberId: "tm-a", cadenceDays: 14, paused: false }], "2026-09-28"),
    ).rejects.toThrow(/coaching_one_on_ones/);
  });

  it("pages past a full page, so a long history never truncates somebody's booking", async () => {
    // PostgREST stops at a page without saying so. A full page means ask again.
    const full = Array.from({ length: 1000 }, (_, i) => row(`h-${i}`, "p-a", "2026-01-01", "held"));
    script("coaching_one_on_ones", { data: full }, { data: [row("b-next", "p-b", "2026-10-01", "scheduled")] });

    const out = await loadSchedules(
      [
        { id: "p-a", teamMemberId: null, cadenceDays: 14, paused: false },
        { id: "p-b", teamMemberId: null, cadenceDays: 14, paused: false },
      ],
      "2026-09-28",
    );

    expect(calls.filter((c) => c.table === "coaching_one_on_ones")).toHaveLength(2);
    expect(out.get("p-b")?.booked?.id).toBe("b-next");
  });

  it("reads nothing for an empty batch", async () => {
    expect((await loadSchedules([], "2026-09-28")).size).toBe(0);
    expect(calls).toEqual([]);
  });
});

describe("loadScheduleFor", () => {
  it("reads the profile's cadence and pause, then its 1-1s", async () => {
    script("coaching_profiles", { data: { id: "p-a", team_member_id: "tm-a", cadence_days: 7, one_on_ones_paused_at: null } });
    script("coaching_one_on_ones", { data: [row("a-held", "p-a", "2026-09-22", "held")] });

    const s = await loadScheduleFor("p-a", "2026-09-28");

    expect(s.suggested).toBe("2026-09-29");
    expect(s.lastOn).toBe("2026-09-22");
  });

  it("suggests nothing while the coach has paused the rhythm", async () => {
    script("coaching_profiles", {
      data: { id: "p-a", team_member_id: "tm-a", cadence_days: 14, one_on_ones_paused_at: "2026-09-20T00:00:00Z" },
    });
    script("coaching_one_on_ones", { data: [row("a-held", "p-a", "2026-09-22", "held")] });

    expect((await loadScheduleFor("p-a", "2026-09-28")).suggested).toBeNull();
  });

  it("raises when the profile cannot be read", async () => {
    script("coaching_profiles", { data: null, error: { message: "timeout" } });
    await expect(loadScheduleFor("p-a", "2026-09-28")).rejects.toThrow(/coaching_profiles/);
  });
});

// The owned-meeting read both writes start with (assertCoachOwnsMeeting).
function ownedMeeting(fields: Record<string, unknown>) {
  script("coaching_one_on_ones", {
    data: {
      id: "m1",
      coaching_profile_id: "p1",
      held_on: "2026-09-23",
      status: "scheduled",
      marked_held_on: null,
      coaching_profiles: { coach_id: "coach-1" },
      ...fields,
    },
  });
}

describe("marking a 1-1 held records the day of the answer", () => {
  it("stamps today's business date, so a 1-1 marked after its day reads as held late", async () => {
    ownedMeeting({});
    script("coaching_one_on_ones", { data: null }); // the update

    expect(await coachMarkOneOnOneHeld(actor, "m1")).toEqual({ ok: true });

    const update = calls.find((c) => c.table === "coaching_one_on_ones" && c.ops.includes("update"));
    expect(update?.payloads).toEqual([
      expect.objectContaining({ status: "held", marked_held_on: "2026-09-28", coach_voltage_md: null }),
    ]);
  });

  it("writes nothing for a 1-1 already held", async () => {
    ownedMeeting({ status: "held" });
    expect(await coachMarkOneOnOneHeld(actor, "m1")).toEqual({ ok: true });
    expect(calls.some((c) => c.ops.includes("update"))).toBe(false);
  });

  it("undoing a held-late mark takes the stamp away with it", async () => {
    ownedMeeting({ status: "held", marked_held_on: "2026-09-28" });
    script("coaching_one_on_ones", { data: null }); // the update

    expect(await coachUndoMarkOneOnOneHeld(actor, "m1")).toEqual({ ok: true });

    const update = calls.find((c) => c.table === "coaching_one_on_ones" && c.ops.includes("update"));
    expect(update?.payloads).toEqual([expect.objectContaining({ status: "scheduled", marked_held_on: null })]);
  });

  it("refuses to undo a 1-1 that was held on its day", async () => {
    // Marked held on the booked day is not held late, so there is no mistaken
    // late mark to take back.
    ownedMeeting({ status: "held", marked_held_on: "2026-09-23" });
    expect(await coachUndoMarkOneOnOneHeld(actor, "m1")).toEqual({
      ok: false,
      error: "Only a missed booking can be put back.",
    });
  });
});

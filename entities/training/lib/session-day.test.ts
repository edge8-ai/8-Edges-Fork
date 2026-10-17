import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The morning routines read one Vietnam day (English Program PR 3): the window
// is the day's 24 hours at +07:00, so the prep routine reads tomorrow's
// sessions and nothing of today's or the day after.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
beforeEach(() => resetFake());
afterEach(() => vi.clearAllMocks());

describe("sessionsOnDay", () => {
  it("asks for sessions on a plan inside the day's +07:00 window, live only", async () => {
    const { dayWindow, sessionsOnDay } = await import("./session-day");
    expect(dayWindow("2026-10-14")).toEqual({ from: "2026-10-13T17:00:00.000Z", to: "2026-10-14T17:00:00.000Z" });
    script("trainings", { data: [{ id: "t1", title: "ECP", starts_at: "2026-10-14T07:00:00Z", ends_at: "2026-10-14T08:15:00Z", organiser_id: "hoan", plan_id: "p1", plan_state: "none" }] });
    const rows = await sessionsOnDay("2026-10-14");
    expect(rows).toEqual([{ id: "t1", title: "ECP", startsAt: "2026-10-14T07:00:00Z", endsAt: "2026-10-14T08:15:00Z", organiserId: "hoan", planId: "p1", planState: "none" }]);
    const q = calls.find((c) => c.table === "trainings");
    expect(q?.filters).toContainEqual(["gte", "starts_at", "2026-10-13T17:00:00.000Z"]);
    expect(q?.filters).toContainEqual(["lt", "starts_at", "2026-10-14T17:00:00.000Z"]);
    expect(q?.filters).toContainEqual(["is", "cancelled_at", null]);
  });
});

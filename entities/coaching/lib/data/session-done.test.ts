import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// coachCompleteSession against a scripted client: which row a "done" lands on
// and what it writes (K.80). The choice itself is sessionTarget's, tested in
// lib/session-done.test.ts; this file holds the writes to it.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (t: string) => builderFor(t) } }));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: async () => "https://example.test" }));
vi.mock("@/kernel/config/dates", async (importActual) => ({
  ...(await importActual<typeof import("@/kernel/config/dates")>()),
  saigonToday: () => "2026-10-06",
}));
const notifyBoth = vi.fn(async () => true);
vi.mock("@/entities/coaching/lib/cycle-shared", () => ({ notifyBoth: (...a: unknown[]) => notifyBoth(...(a as [])) }));
type Row = { id: string; day: string };
const loadScheduleFor = vi.fn(async (): Promise<{ booked: Row | null; awaiting: Row | null }> => ({ booked: null, awaiting: null }));
vi.mock("./one-on-one-schedule", () => ({ loadScheduleFor: (...a: unknown[]) => loadScheduleFor(...(a as [])) }));
const liveScheduledRowOn = vi.fn(async (): Promise<{ id: string; status: string } | null> => null);
vi.mock("./move-meeting", () => ({ liveScheduledRowOn: (...a: unknown[]) => liveScheduledRowOn(...(a as [])) }));

const order: string[] = [];
vi.mock("./coach-edits", () => ({
  coachSetMinutesLink: async (_a: unknown, id: string) => {
    order.push(`minutes:${id}`);
    return { ok: true };
  },
}));
vi.mock("./one-on-ones", () => ({
  coachSaveTranscript: async (_a: unknown, id: string) => {
    order.push(`transcript:${id}`);
    return { ok: true };
  },
}));

import { coachCompleteSession, type SessionDoneInput } from "./session-done";
const commitmentAdds: unknown[] = [];
vi.mock("./commitments", () => ({
  coachAddCommitment: async (_a: unknown, _p: string, input: unknown) => {
    commitmentAdds.push(input);
    return { ok: true };
  },
}));
import type { TeamActor } from "@/kernel/identity/team-auth";

const actor = { teamMemberId: "coach-1" } as TeamActor;
const input = (o: Partial<SessionDoneInput>): SessionDoneInput => ({
  day: "2026-10-06",
  which: "booked",
  note: "",
  privateNote: "",
  format: null,
  steps: [],
  minutesUrl: "",
  transcript: "",
  ...o,
});
const owned = () => script("coaching_profiles", { data: { id: "p1", coach_id: "coach-1" } });

describe("coachCompleteSession", () => {
  beforeEach(() => {
    resetFake();
    notifyBoth.mockClear();
    loadScheduleFor.mockResolvedValue({ booked: null, awaiting: null });
    liveScheduledRowOn.mockResolvedValue(null);
    commitmentAdds.length = 0;
    order.length = 0;
  });

  it("saves the recording, lets the AI draft, then lays the coach's own note over it", async () => {
    owned();
    script("coaching_one_on_ones", { data: { id: "o-new" } }); // the insert
    script("coaching_one_on_ones", { data: null }); // the note patch
    const summarize = vi.fn(async (id: string) => {
      order.push(`summarize:${id}`);
    });
    const res = await coachCompleteSession(
      actor,
      "p1",
      input({ minutesUrl: "https://x.larksuite.com/minutes/abc123", transcript: "Coach: hi", note: "Great week." }),
      summarize,
    );
    expect(res).toEqual({ ok: true });
    expect(order).toEqual(["minutes:o-new", "transcript:o-new", "summarize:o-new"]);
    const updates = calls.filter((c) => c.table === "coaching_one_on_ones" && c.ops.includes("update"));
    // The note is the last write to the row, after the summary drafted its own.
    expect(updates.at(-1)?.payloads).toEqual([expect.objectContaining({ shared_summary_markdown: "Great week." })]);
  });

  it("writes nothing about a recording that was not given, and runs no summary", async () => {
    owned();
    script("coaching_one_on_ones", { data: { id: "o-new" } });
    const summarize = vi.fn();
    const res = await coachCompleteSession(actor, "p1", input({}), summarize);
    expect(res).toEqual({ ok: true });
    expect(order).toEqual([]);
    expect(summarize).not.toHaveBeenCalled();
  });

  it("records an extra conversation and leaves the booking ahead where it is", async () => {
    owned();
    loadScheduleFor.mockResolvedValue({ booked: { id: "o-next", day: "2026-10-08" }, awaiting: null });
    script("coaching_one_on_ones", { data: { id: "o-extra" } });
    const res = await coachCompleteSession(actor, "p1", input({ which: "extra", day: "2026-10-02" }));
    expect(res).toEqual({ ok: true });
    expect(calls.some((c) => c.table === "coaching_one_on_ones" && c.ops.includes("update"))).toBe(false);
    const insert = calls.find((c) => c.table === "coaching_one_on_ones" && c.ops.includes("insert"));
    expect(insert?.payloads).toEqual([expect.objectContaining({ held_on: "2026-10-02", status: "held" })]);
  });

  it("stores the format and the private note, and adds next steps to this session", async () => {
    owned();
    script("coaching_one_on_ones", { data: { id: "o-new" } }); // the insert
    script("coaching_one_on_ones", { data: null }); // the private note
    const res = await coachCompleteSession(
      actor,
      "p1",
      input({ format: "call", privateNote: "Tired; ask about on-call.", steps: [{ title: "Draft the agenda", owner: "member" }, { title: " ", owner: "coach" }] }),
    );
    expect(res).toEqual({ ok: true });
    const insert = calls.find((c) => c.table === "coaching_one_on_ones" && c.ops.includes("insert"));
    expect(insert?.payloads).toEqual([expect.objectContaining({ format: "call", status: "held" })]);
    const noteWrite = calls.find((c) => c.table === "coaching_one_on_ones" && c.ops.includes("update"));
    expect(noteWrite?.payloads).toEqual([expect.objectContaining({ summary_markdown: "Tired; ask about on-call." })]);
    expect(commitmentAdds).toEqual([expect.objectContaining({ title: "Draft the agenda", owner: "member", oneOnOneId: "o-new" })]);
  });

  it("refuses a day that has not come yet and writes nothing", async () => {
    owned();
    const res = await coachCompleteSession(actor, "p1", input({ day: "2026-10-07", note: "" }));
    expect(res.ok).toBe(false);
    expect(calls.some((c) => c.table === "coaching_one_on_ones")).toBe(false);
  });

  it("records a session with nothing booked as held on the day it happened", async () => {
    owned();
    script("coaching_one_on_ones", { data: { id: "o-new" } });
    const res = await coachCompleteSession(actor, "p1", input({ day: "2026-10-06", note: "" }));
    expect(res).toEqual({ ok: true });
    const insert = calls.find((c) => c.table === "coaching_one_on_ones" && c.ops.includes("insert"));
    expect(insert?.payloads).toEqual([expect.objectContaining({ held_on: "2026-10-06", status: "held" })]);
  });

  it("moves a booking still ahead to the day they met and closes it there", async () => {
    owned();
    loadScheduleFor.mockResolvedValue({ booked: { id: "o-next", day: "2026-10-08" }, awaiting: null });
    script("coaching_one_on_ones", { data: null });
    const res = await coachCompleteSession(actor, "p1", input({ day: "2026-10-06", note: "" }));
    expect(res).toEqual({ ok: true });
    const update = calls.find((c) => c.table === "coaching_one_on_ones" && c.ops.includes("update"));
    expect(update?.payloads).toEqual([
      expect.objectContaining({ status: "held", held_on: "2026-10-06", moved_from: "2026-10-08" }),
    ]);
    expect(calls.some((c) => c.ops.includes("insert"))).toBe(false);
  });

  it("publishes the coach's note as the shared recap", async () => {
    owned();
    loadScheduleFor.mockResolvedValue({ booked: null, awaiting: { id: "o-passed", day: "2026-10-01" } });
    script("coaching_one_on_ones", { data: null }); // held
    script("coaching_one_on_ones", { data: null }); // the note
    const res = await coachCompleteSession(actor, "p1", input({ day: "2026-10-06", note: "  Great progress on the runbook.  " }));
    expect(res).toEqual({ ok: true });
    const [held, note] = calls.filter((c) => c.table === "coaching_one_on_ones" && c.ops.includes("update"));
    expect(held?.payloads).toEqual([expect.objectContaining({ status: "held" })]);
    // A passed booking keeps its own day: it is held late, not moved.
    expect(held?.payloads?.[0]).not.toHaveProperty("held_on");
    expect(note?.payloads).toEqual([
      expect.objectContaining({ shared_summary_markdown: "Great progress on the runbook.", shared_published_at: expect.any(String) }),
    ]);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

// The pass over stubbed doors: the meetings read, the platform list and write,
// the model, the chat. What is asserted is what the run would show and what
// would be written where; the rules themselves are in key-learnings-match.test.ts.

type Row = { id: string; title: string | null; started_at: string; metadata: Record<string, unknown> };
let rows: Row[] = [];
let readError: { message: string } | null = null;
const recorded: { id: string; metadata: Record<string, unknown> }[] = [];
const writes: { id: string; items: string[]; expected: unknown }[] = [];
const notices: unknown[] = [];
let platformOn = true;
let events: Record<string, unknown>[] = [];

vi.mock("@/entities/crm", () => ({
  groupSessionsAwaitingRecord: async () => ({ data: rows, error: readError }),
  setMeetingMetadata: async (id: string, metadata: Record<string, unknown>) => {
    recorded.push({ id, metadata });
    return { error: null };
  },
}));
vi.mock("./learning-platform", () => ({
  learningPlatform: () => (platformOn ? { ok: true, platform: { url: "https://platform.example", key: "k" } } : { ok: false, reason: "platform keys not set" }),
  listCoachingEvents: async () => ({ ok: true, events }),
  writeEventLearnings: async (_p: unknown, id: string, items: string[], expected: unknown) => {
    writes.push({ id, items, expected });
    return id === "refuses" ? { ok: false, error: "touched 0 rows" } : { ok: true };
  },
  adminSessionUrl: (id: string) => `https://platform.example/admin/coaching/${id}`,
}));
vi.mock("./key-learnings", () => ({
  generateKeyLearnings: async (transcript: string) =>
    transcript.includes("DECLINE") ? { ok: false, error: "The model declined this transcript." } : { ok: true, items: ["Plan first", "Ship small", "Measure it"], model: "claude-test" },
}));
vi.mock("@/kernel/messaging/lark", () => ({
  sendLarkMessage: async (message: unknown) => {
    notices.push(message);
    return true;
  },
}));

import { learningsNotice, syncKeyLearnings } from "./key-learnings-sync";

const JOIN = "https://us06web.zoom.us/j/81941198605?pwd=x";
const meeting = (id: string, started_at: string, over: Partial<Row> = {}): Row => ({
  id,
  title: `Session ${id}`,
  started_at,
  metadata: { transcript: "Coach: plan first.", zoom_meeting_id: "81941198605" },
  ...over,
});
const event = (id: string, scheduled_at: string, key_learnings: unknown = null, status = "completed") => ({
  id,
  title: `#00${id} Live group coaching`,
  scheduled_at,
  status,
  meeting_url: JOIN,
  key_learnings,
});

describe("syncKeyLearnings", () => {
  beforeEach(() => {
    rows = [];
    readError = null;
    recorded.length = 0;
    writes.length = 0;
    notices.length = 0;
    platformOn = true;
    events = [];
  });

  it("is off, with the reason and no read, while the platform keys are unset", async () => {
    platformOn = false;
    const errors: string[] = [];
    expect(await syncKeyLearnings("2026-10-15", errors)).toMatchObject({ enabled: false, reason: "platform keys not set", checked: 0 });
    expect(errors).toEqual([]);
  });

  it("writes an empty session, records what it wrote, and tells the chat where to edit", async () => {
    rows = [meeting("m4", "2026-10-15T03:55:47+00:00")];
    events = [event("4", "2026-10-15T04:00:00+00:00"), event("4x", "2026-10-15T04:00:00+00:00", null, "cancelled")];
    const errors: string[] = [];
    const result = await syncKeyLearnings("2026-10-15", errors);
    expect(errors).toEqual([]);
    expect(result).toMatchObject({ enabled: true, checked: 1, kept: 0, unmatched: [] });
    expect(result.written).toEqual([{ meetingId: "m4", liveEventId: "4", title: "#004 Live group coaching", items: 3 }]);
    expect(writes).toEqual([{ id: "4", items: ["Plan first", "Ship small", "Measure it"], expected: null }]);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].id).toBe("m4");
    expect(recorded[0].metadata.transcript).toBe("Coach: plan first.");
    expect(recorded[0].metadata.platform_learnings).toMatchObject({ outcome: "written", live_event_id: "4", items: ["Plan first", "Ship small", "Measure it"], model: "claude-test" });
    expect(notices).toEqual([learningsNotice("#004 Live group coaching", 3, "https://platform.example/admin/coaching/4")]);
  });

  it("keeps a session a person wrote, records it as kept, and writes nothing", async () => {
    rows = [meeting("m1", "2026-09-17T03:59:26+00:00")];
    events = [event("1", "2026-09-17T04:00:00+00:00", ["Focus on Planning"])];
    const errors: string[] = [];
    const result = await syncKeyLearnings("2026-10-15", errors);
    expect(errors).toEqual([]);
    expect(result).toMatchObject({ checked: 1, kept: 1, written: [] });
    expect(writes).toEqual([]);
    expect(notices).toEqual([]);
    expect(recorded[0].metadata.platform_learnings).toMatchObject({ outcome: "kept", live_event_id: "1" });
  });

  it("lists a meeting with no platform session and leaves it unrecorded, so it is retried", async () => {
    rows = [meeting("m9", "2026-10-22T04:00:00+00:00")];
    events = [];
    const errors: string[] = [];
    const result = await syncKeyLearnings("2026-10-15", errors);
    expect(errors).toEqual([]);
    expect(result.unmatched).toEqual(['2026-10-22 "Session m9" (m9)']);
    expect(recorded).toEqual([]);
  });

  it("refuses two sessions in the window, records it, and names them", async () => {
    rows = [meeting("m4", "2026-10-15T03:55:47+00:00")];
    events = [event("4", "2026-10-15T04:00:00+00:00"), event("4b", "2026-10-15T05:00:00+00:00")];
    const errors: string[] = [];
    await syncKeyLearnings("2026-10-15", errors);
    expect(errors).toEqual([expect.stringContaining("2 platform sessions fit (4, 4b)")]);
    expect(recorded[0].metadata.platform_learnings).toMatchObject({ outcome: "ambiguous", candidates: ["4", "4b"] });
    expect(writes).toEqual([]);
  });

  it("names the recording a failure belongs to and goes on to the next meeting", async () => {
    rows = [
      meeting("m4", "2026-10-15T03:55:47+00:00", { metadata: { transcript: "DECLINE", zoom_meeting_id: "81941198605" } }),
      meeting("m3", "2026-10-08T04:02:21+00:00"),
    ];
    events = [event("4", "2026-10-15T04:00:00+00:00"), event("refuses", "2026-10-08T03:11:00+00:00")];
    const errors: string[] = [];
    const result = await syncKeyLearnings("2026-10-15", errors);
    expect(errors).toEqual([
      'key learnings failed for 2026-10-15 "Session m4" (m4): The model declined this transcript.',
      'key learnings write failed for 2026-10-08 "Session m3" (m3): touched 0 rows',
    ]);
    expect(result).toMatchObject({ checked: 2, written: [], kept: 0 });
    // Neither meeting is recorded: both are retried on the next run.
    expect(recorded).toEqual([]);
  });

  it("reports a failed meetings read and does nothing else", async () => {
    readError = { message: "connection reset" };
    const errors: string[] = [];
    const result = await syncKeyLearnings("2026-10-15", errors);
    expect(errors).toEqual(["key learnings read failed: connection reset"]);
    expect(result.checked).toBe(0);
  });
});

describe("learningsNotice", () => {
  it("names the session, the count and where to edit, and says edits stick", () => {
    const text = learningsNotice("#004 Live group coaching", 6, "https://platform.example/admin/coaching/abc");
    expect(text).toBe(
      "Key learnings posted for #004 Live group coaching: 6 items, written from the transcript. " +
        "Read or edit them at https://platform.example/admin/coaching/abc. A list edited there is never overwritten.",
    );
  });

  it("counts one item in the singular", () => {
    expect(learningsNotice("x", 1, "u")).toContain("1 item,");
  });
});

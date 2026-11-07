import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// A transcript in by hand (PR 6): the meeting is created once and reused on a
// replace; attendance is re-derived from the new text but a learner's or the
// organiser's correction is kept.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
beforeEach(() => resetFake());
afterEach(() => vi.clearAllMocks());

const NOW = new Date("2026-10-14T09:00:00Z");
const person = (full: string, preferred: string | null) => ({ display_name: null, preferred_name: preferred, full_name: full, email: null, first_name: null });
const TRAINING = { organiser_id: "hoan", starts_at: "2026-10-14T07:00:00Z", ends_at: "2026-10-14T08:15:00Z", cancelled_at: null, self_logged: false, created_at: "2026-10-01T00:00:00Z" };
const ROSTER = [
  { id: "r1", person_id: "duc", status: "pending", source: "member", reviews: [], training: TRAINING, person: person("Nguyễn Văn Đức", null) },
  { id: "r2", person_id: "harry", status: "attended", source: "organiser", reviews: [], training: TRAINING, person: person("Lê Vinh", "Harry") },
];
const input = (transcript: string) => ({ trainingId: "t1", organiserId: "hoan", title: "ECP", startsAt: "2026-10-14T07:00:00Z", endsAt: "2026-10-14T08:15:00Z", transcript, externalId: "training:t1" });

describe("saveTranscriptIn", () => {
  it("creates the meeting, the association and the transcript, then sets attendance from the text, keeping the organiser's correction", async () => {
    const { saveTranscriptIn } = await import("./transcript-in");
    script("meeting_associations", { data: [] }, { data: null });
    script("meetings", { data: { id: "m1" } });
    script("call_transcripts", { data: null });
    script("training_attendance", { data: ROSTER }, { data: null });
    const res = await saveTranscriptIn(input("Hoan Ngo: hello\nDuc Nguyen: hi"), NOW);
    expect(res).toEqual({ ok: true, meetingId: "m1" });
    expect(calls.find((c) => c.table === "meetings" && c.ops.includes("insert"))?.payloads[0]).toMatchObject({ source: "training", meeting_type: "Training", external_id: "training:t1", owner_id: "hoan" });
    expect(calls.find((c) => c.table === "meeting_associations" && c.ops.includes("insert"))?.payloads[0]).toEqual({ meeting_id: "m1", entity_type: "training", entity_id: "t1" });
    const t = calls.find((c) => c.table === "call_transcripts" && c.ops.includes("upsert"));
    expect(t?.payloads[0]).toMatchObject({ meeting_id: "m1", source: "training", transcript: "Hoan Ngo: hello\nDuc Nguyen: hi" });
    // Đức was heard and was pending: set from the transcript. Harry was set by the organiser: untouched.
    const updates = calls.filter((c) => c.table === "training_attendance" && c.ops.includes("update"));
    expect(updates).toHaveLength(1);
    expect(updates[0]?.payloads[0]).toMatchObject({ status: "attended", source: "transcript" });
    expect(updates[0]?.filters).toContainEqual(["eq", "id", "r1"]);
  });

  it("reuses the meeting on a replacement and does not insert a second association", async () => {
    const { saveTranscriptIn } = await import("./transcript-in");
    script("meeting_associations", { data: [{ meeting_id: "m1" }] });
    script("call_transcripts", { data: null });
    script("training_attendance", { data: [{ ...ROSTER[0], status: "attended", source: "transcript" }] }, { data: null });
    const res = await saveTranscriptIn(input("Hoan Ngo: only me today"), NOW);
    expect(res).toEqual({ ok: true, meetingId: "m1" });
    expect(calls.filter((c) => c.table === "meetings" && c.ops.includes("insert"))).toEqual([]);
    expect(calls.filter((c) => c.table === "meeting_associations" && c.ops.includes("insert"))).toEqual([]);
    // The transcript no longer hears Đức: his transcript-set row flips to absent.
    expect(calls.find((c) => c.table === "training_attendance" && c.ops.includes("update"))?.payloads[0]).toMatchObject({ status: "absent", source: "transcript" });
  });
});

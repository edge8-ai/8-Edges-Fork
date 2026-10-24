import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// B9 (K.11): ensureCoachingMeeting used to check-then-insert. Two concurrent
// saves of the same 1-1 both read meeting_id null, both inserted, and the
// loser's orphan meeting stayed behind; any insert failure came back as a flat
// "Could not link the coaching session to a meeting." These cases pin the
// unique-violation re-read and the surfaced insert error.
//
// The fake Supabase client is the one from entities/coaching/lib/ai.test.ts.

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table) },
}));

import { saveCoachingTranscript } from "./transcript";

// The 1-1 as loadLink reads it: held, with a coach, and no meeting yet — the
// only state in which ensureCoachingMeeting inserts.
const UNLINKED = {
  id: "o-1",
  held_on: "2026-09-16",
  meeting_id: null,
  coaching_profiles: { coach_id: "coach-1" },
};

beforeEach(() => {
  resetFake();
});

// PostgREST's error carries a code beside the message, and the transcript
// writer branches on it (23505 is the unique index). The kernel fake passes an
// error through as scripted but types only its message, so the code rides on a
// widened object.
const pgError = (message: string, code: string) => ({ message, code }) as { message: string };

describe("saveCoachingTranscript", () => {
  it("adopts the meeting the other writer created when the insert hits the unique index", async () => {
    script("coaching_one_on_ones", { data: UNLINKED }, { data: null });
    // 1: the losing insert. 2: the re-read by the metadata key.
    script(
      "meetings",
      { error: pgError('duplicate key value violates unique constraint "meetings_coaching_one_on_one_uniq"', "23505") },
      { data: { id: "m-winner" } },
    );
    script("call_transcripts", { data: null });

    const res = await saveCoachingTranscript("o-1", "Coach: how did the week go?");

    expect(res).toEqual({ ok: true, meetingId: "m-winner" });
    // The transcript went onto the winner's meeting, not a second one.
    const upsert = calls.find((c) => c.table === "call_transcripts");
    expect(upsert?.payloads[0]).toMatchObject({ meeting_id: "m-winner" });
  });

  it("surfaces the real insert error instead of a generic link failure", async () => {
    script("coaching_one_on_ones", { data: UNLINKED });
    script("meetings", { error: pgError("permission denied for table meetings", "42501") });

    const res = await saveCoachingTranscript("o-1", "Coach: how did the week go?");

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain("permission denied for table meetings");
    // Nothing was written to call_transcripts on a failed link.
    expect(calls.some((c) => c.table === "call_transcripts")).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { queries, recordingFrom, resetQueries, type Step } from "./testing/query-recorder";

// What a client's people may read of a meeting, and the summariser's reads
// and writes (A.63). Each row is the query portal/lib/meetings.ts or
// assistant/lib/meeting-summary.ts built by hand before A.63. The portal rows
// also pin the privacy line: no transcript, nothing beyond the notes.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: recordingFrom } }));

import {
  anyMeetingOfCompanies,
  anyPublishedMeetingOfCompanies,
  clientMeetingNote,
  clientMeetingNotes,
  markMeetingSummaryFailed,
  meetingToSummarise,
  recordMeetingSummary,
} from "./client-meeting-notes";

const NOW = "2026-10-17T05:00:00.000Z";

beforeEach(() => {
  resetQueries();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
});

const NOTE =
  "id, company_id, started_at, title, attendees, summary, published_at, ai_program_id, ai_program:ai_programs!ai_program_id(name)";

const cases: [string, () => Promise<unknown>, Step[]][] = [
  // portal hasMeetings, the manager's arm.
  ["anyMeetingOfCompanies", () => anyMeetingOfCompanies(["c1"]), [["select", "id"], ["in", "company_id", ["c1"]], ["is", "archived_at", null], ["limit", 1]]],
  // portal hasMeetings, the member's arm.
  [
    "anyPublishedMeetingOfCompanies",
    () => anyPublishedMeetingOfCompanies(["c1", "c2"]),
    [["select", "id"], ["is", "archived_at", null], ["in", "company_id", ["c1", "c2"]], ["not", "published_at", "is", null], ["limit", 1]],
  ],
  // portal getMeetingForActor.
  ["clientMeetingNote", () => clientMeetingNote("m1", ["c1"]), [["select", NOTE], ["eq", "id", "m1"], ["in", "company_id", ["c1"]], ["is", "archived_at", null], ["maybeSingle"]]],
  // portal getMeetingsForActor.
  [
    "clientMeetingNotes",
    () => clientMeetingNotes(["c1"]),
    [
      ["select", NOTE],
      ["in", "company_id", ["c1"]],
      ["is", "archived_at", null],
      ["order", "started_at", { ascending: false, nullsFirst: false }],
      ["order", "created_at", { ascending: false }],
    ],
  ],
  // assistant meeting-summary run.
  [
    "meetingToSummarise",
    () => meetingToSummarise("m1"),
    [["select", "id, title, attendees, started_at, call_transcripts(transcript)"], ["eq", "id", "m1"], ["in", "source", ["notes", "lark"]], ["maybeSingle"]],
  ],
  // assistant meeting-summary markFailed: the error is cut to 500 characters.
  [
    "markMeetingSummaryFailed",
    () => markMeetingSummaryFailed("m1", "x".repeat(600)),
    [["update", { ai_status: "failed", ai_error: "x".repeat(500), updated_at: NOW }], ["eq", "id", "m1"]],
  ],
  // assistant meeting-summary run, nothing blank to fill.
  [
    "recordMeetingSummary (summary only)",
    () => recordMeetingSummary("m1", { summary: "S", model: "fast" }),
    [["update", { summary: "S", summary_encrypted: false, ai_model: "fast", ai_status: "ready", ai_error: null, updated_at: NOW }], ["eq", "id", "m1"]],
  ],
  // assistant meeting-summary run, every blank filled.
  [
    "recordMeetingSummary (blanks filled)",
    () => recordMeetingSummary("m1", { summary: "S", model: "fast", title: "T", attendees: ["An"], startedAt: "2026-10-16" }),
    [
      [
        "update",
        { summary: "S", summary_encrypted: false, ai_model: "fast", ai_status: "ready", ai_error: null, updated_at: NOW, title: "T", attendees: ["An"], started_at: "2026-10-16" },
      ],
      ["eq", "id", "m1"],
    ],
  ],
];

describe("client meeting notes", () => {
  it.each(cases)("%s makes the query its caller made", async (_name, call, steps) => {
    await call();
    expect(queries).toEqual([{ table: "meetings", steps }]);
  });

  it("never selects the transcript for the portal", async () => {
    await clientMeetingNote("m1", ["c1"]);
    await clientMeetingNotes(["c1"]);
    for (const q of queries) expect(String(q.steps[0][1])).not.toMatch(/transcript/);
  });
});

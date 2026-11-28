import { beforeEach, describe, expect, it, vi } from "vitest";
import { queries, recordingFrom, resetQueries, type Step } from "./testing/query-recorder";

// "A group coaching session" (A.63): each row is the query a coaching reader
// built by hand before A.63, so the two filters that define a session are
// pinned once here for all of them.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: recordingFrom } }));

import {
  claimGroupSessionStage,
  groupCoachingSession,
  groupCoachingSessions,
  groupSessionForTranscript,
  groupSessionsAwaitingRecord,
  groupSessionsMissingAttendees,
  zoomRecordingMeeting,
} from "./group-sessions";

beforeEach(() => resetQueries());

const SESSION = "id, title, started_at, duration_seconds, summary, recording_url, metadata";
const IS_SESSION: Step[] = [
  ["eq", "source", "zoom"],
  ["eq", "metadata->>source_meeting_type", "coaching"],
];
const NEWEST_FIRST: Step = ["order", "started_at", { ascending: false, nullsFirst: false }];

const cases: [string, () => Promise<unknown>, Step[]][] = [
  // coaching sessions.ts listCoachingSessions: no cap.
  ["groupCoachingSessions()", () => groupCoachingSessions(), [["select", SESSION], ...IS_SESSION, ["is", "archived_at", null], NEWEST_FIRST]],
  // coaching my-timeline.ts getMySessionsAttended asked for id, title, started_at, metadata; the union is wider.
  ["groupCoachingSessions(60)", () => groupCoachingSessions(60), [["select", SESSION], ...IS_SESSION, ["is", "archived_at", null], NEWEST_FIRST, ["limit", 60]]],
  // coaching sessions.ts getCoachingSession.
  ["groupCoachingSession", () => groupCoachingSession("m1"), [["select", SESSION], ["eq", "id", "m1"], ...IS_SESSION, ["is", "archived_at", null], ["maybeSingle"]]],
  // coaching zoom-ingest.ts ingestOne's dedup, with how far the ingest got.
  [
    "zoomRecordingMeeting",
    () => zoomRecordingMeeting("uuid-1"),
    [
      ["select", "id, stage:metadata->>ingest_stage, claimedAt:metadata->>ingest_claimed_at"],
      ["eq", "source", "zoom"],
      ["eq", "external_id", "uuid-1"],
      ["limit", 1],
      ["maybeSingle"],
    ],
  ],
  // coaching zoom-ingest-write.ts writeTranscriptStage.
  ["groupSessionForTranscript", () => groupSessionForTranscript("m1"), [["select", "id, title, summary, metadata"], ["eq", "id", "m1"], ["maybeSingle"]]],
  [
    "claimGroupSessionStage",
    () => claimGroupSessionStage("m1", "summary", { ingest_stage: "enriching" }),
    [["update", { metadata: { ingest_stage: "enriching" } }], ["eq", "id", "m1"], ["eq", "metadata->>ingest_stage", "summary"], ["select", "id"]],
  ],
  // coaching zoom-ingest.ts backfillAttendees.
  [
    "groupSessionsMissingAttendees",
    () => groupSessionsMissingAttendees(5),
    [["select", "id, external_id, metadata"], ...IS_SESSION, ["is", "metadata->attendees", null], ["order", "started_at", { ascending: false }], ["limit", 5]],
  ],
  // coaching key-learnings-sync.ts syncKeyLearnings.
  [
    "groupSessionsAwaitingRecord",
    () => groupSessionsAwaitingRecord("platform_learnings", "2026-09-17", 3),
    [
      ["select", "id, title, started_at, metadata"],
      ...IS_SESSION,
      ["not", "metadata->>transcript", "is", null],
      ["is", "metadata->platform_learnings", null],
      ["gte", "started_at", "2026-09-17"],
      ["order", "started_at", { ascending: false }],
      ["limit", 3],
    ],
  ],
];

describe("group coaching sessions", () => {
  it.each(cases)("%s makes the query its caller made", async (_name, call, steps) => {
    await call();
    expect(queries).toEqual([{ table: "meetings", steps }]);
  });
});

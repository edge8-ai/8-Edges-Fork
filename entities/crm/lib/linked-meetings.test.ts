import { beforeEach, describe, expect, it, vi } from "vitest";
import { queries, recordingFrom, resetQueries, type Step } from "./testing/query-recorder";

// The meetings a 1-1, a review and a training own (A.63): each row is the query
// its caller built by hand before A.63, and the transcript questions beside them.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: recordingFrom } }));

import {
  coachingOneOnOneMeeting,
  linkMeetingToTraining,
  meetingOfTraining,
  meetingRecordingLinks,
  meetingsWithExternalId,
  relinkMeetingRecording,
  reviewMeeting,
} from "./linked-meetings";
import { saveMeetingTranscript, transcriptOfMeeting, transcriptRowsOfMeeting } from "./call-transcripts";

beforeEach(() => resetQueries());

const transcript = { meeting_id: "m1", title: "1-1", started_at: null, source: "coaching", call_type: "internal", transcript: "Hello", updated_at: "2026-10-17T00:00:00Z" };

const cases: [string, () => Promise<unknown>, string, Step[]][] = [
  // coaching transcript.ts, the race's re-read.
  ["coachingOneOnOneMeeting", () => coachingOneOnOneMeeting("o1"), "meetings", [["select", "id"], ["eq", "metadata->>coaching_one_on_one_id", "o1"], ["maybeSingle"]]],
  // team reviews/transcript.ts findReviewMeeting.
  ["reviewMeeting", () => reviewMeeting("r1"), "meetings", [["select", "id"], ["eq", "source", "review"], ["eq", "metadata->>performance_review_id", "r1"], ["maybeSingle"]]],
  // training transcript-in.ts meetingOf.
  [
    "meetingOfTraining",
    () => meetingOfTraining("t1"),
    "meeting_associations",
    [["select", "meeting_id"], ["eq", "entity_type", "training"], ["eq", "entity_id", "t1"], ["limit", 1]],
  ],
  [
    "linkMeetingToTraining",
    () => linkMeetingToTraining("m1", "t1"),
    "meeting_associations",
    [["insert", { meeting_id: "m1", entity_type: "training", entity_id: "t1" }]],
  ],
  // training transcript-in.ts readSessionTranscript and meetingExistsFor.
  ["meetingRecordingLinks", () => meetingRecordingLinks("m1"), "meetings", [["select", "id, recording_url, minutes_url"], ["eq", "id", "m1"], ["limit", 1]]],
  ["meetingsWithExternalId", () => meetingsWithExternalId("training:t1"), "meetings", [["select", "id"], ["eq", "external_id", "training:t1"], ["limit", 1]]],
  // training transcript-in.ts saveTranscriptIn on a replacement.
  [
    "relinkMeetingRecording",
    () => relinkMeetingRecording("m1", { recordingUrl: "https://rec", minutesUrl: null }, "tok"),
    "meetings",
    [["update", { recording_url: "https://rec", minutes_url: null, external_id: "tok" }], ["eq", "id", "m1"]],
  ],
  // coaching and team transcript reads asked for `transcript`; the union adds updated_at.
  ["transcriptOfMeeting", () => transcriptOfMeeting("m1"), "call_transcripts", [["select", "transcript, updated_at"], ["eq", "meeting_id", "m1"], ["maybeSingle"]]],
  // training readSessionTranscript.
  ["transcriptRowsOfMeeting", () => transcriptRowsOfMeeting("m1"), "call_transcripts", [["select", "transcript, updated_at"], ["eq", "meeting_id", "m1"], ["limit", 1]]],
  // coaching, team and training saves.
  ["saveMeetingTranscript", () => saveMeetingTranscript(transcript), "call_transcripts", [["upsert", transcript, { onConflict: "meeting_id" }]]],
];

describe("linked meetings and transcripts", () => {
  it.each(cases)("%s makes the query its caller made", async (_name, call, table, steps) => {
    await call();
    expect(queries).toEqual([{ table, steps }]);
  });
});

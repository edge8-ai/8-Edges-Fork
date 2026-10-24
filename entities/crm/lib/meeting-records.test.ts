import { beforeEach, describe, expect, it, vi } from "vitest";
import { queries, recordingFrom, resetQueries, type Step } from "./testing/query-recorder";

// The meeting questions and commands crm's door answers (A.63). Each row is the
// query a caller in another entity built by hand before A.63, step for step,
// so this table is the proof that moving the query into crm changed nothing.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: recordingFrom } }));

import {
  actionItemsOfMeeting,
  addMeetingActionItems,
  addMeetingParticipants,
  findMeeting,
  liveMeetingCompany,
  meetingSummariesSince,
  publishMeetingNotes,
  recentMeetings,
  recordMeeting,
  setMeetingMetadata,
  tagMeetingProgram,
  unwindMeeting,
} from "./meeting-records";

const NOW = "2026-10-17T05:00:00.000Z";

beforeEach(() => {
  resetQueries();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
});

const participant = { meeting_id: "m1", person_id: null, external_email: null, display_name: "An", role: "attendee", attended: true };
const item = { meeting_id: "m1", title: "Send the deck", detail: null, assignee_id: null, due_date: null, status: "open", position: 0 };

const cases: [string, () => Promise<unknown>, string, Step[]][] = [
  // coaching zoom-ingest, coaching 1-1s, team reviews, training: insert and read back the id.
  ["recordMeeting", () => recordMeeting({ source: "zoom", title: "Session" }), "meetings", [["insert", { source: "zoom", title: "Session" }], ["select", "id"], ["single"]]],
  // boards sprint-actions setSprintMeeting.
  ["findMeeting", () => findMeeting("m1"), "meetings", [["select", "id"], ["eq", "id", "m1"], ["maybeSingle"]]],
  // team hub meetings actions, both actions.
  ["liveMeetingCompany", () => liveMeetingCompany("m1"), "meetings", [["select", "company_id"], ["eq", "id", "m1"], ["is", "archived_at", null], ["maybeSingle"]]],
  // boards data listRecentMeetings.
  [
    "recentMeetings",
    () => recentMeetings(40),
    "meetings",
    [["select", "id, title, started_at"], ["is", "archived_at", null], ["not", "started_at", "is", null], ["order", "started_at", { ascending: false }], ["limit", 40]],
  ],
  // campaigns letter readMeetings.
  [
    "meetingSummariesSince",
    () => meetingSummariesSince("2026-10-01", 20),
    "meetings",
    [["select", "title, started_at, summary"], ["gte", "started_at", "2026-10-01"], ["order", "started_at", { ascending: false }], ["limit", 20]],
  ],
  // team hub publishMeeting.
  ["publishMeetingNotes (publish)", () => publishMeetingNotes("m1", true), "meetings", [["update", { published_at: NOW, updated_at: NOW }], ["eq", "id", "m1"]]],
  ["publishMeetingNotes (withdraw)", () => publishMeetingNotes("m1", false), "meetings", [["update", { published_at: null, updated_at: NOW }], ["eq", "id", "m1"]]],
  // team hub setMeetingProgram.
  ["tagMeetingProgram", () => tagMeetingProgram("m1", "p1"), "meetings", [["update", { ai_program_id: "p1", updated_at: NOW }], ["eq", "id", "m1"]]],
  // coaching zoom-ingest backfill and key-learnings record.
  ["setMeetingMetadata", () => setMeetingMetadata("m1", { attendees: ["An"] }), "meetings", [["update", { metadata: { attendees: ["An"] } }], ["eq", "id", "m1"]]],
  // coaching zoom-ingest writeMeeting and backfill.
  ["addMeetingParticipants", () => addMeetingParticipants([participant]), "meeting_participants", [["insert", [participant]]]],
  ["addMeetingActionItems", () => addMeetingActionItems([item]), "meeting_action_items", [["insert", [item]]]],
  // coaching sessions getCoachingSession.
  [
    "actionItemsOfMeeting",
    () => actionItemsOfMeeting("m1"),
    "meeting_action_items",
    [["select", "title, detail, due_date, position"], ["eq", "meeting_id", "m1"], ["order", "position", { ascending: true }]],
  ],
];

describe("meeting questions and commands", () => {
  it.each(cases)("%s makes the query its caller made", async (_name, call, table, steps) => {
    await call();
    expect(queries).toEqual([{ table, steps }]);
  });

  it("unwindMeeting deletes the action items, then the participants, then the meeting", async () => {
    await unwindMeeting("m1");
    expect(queries).toEqual([
      { table: "meeting_action_items", steps: [["delete"], ["eq", "meeting_id", "m1"]] },
      { table: "meeting_participants", steps: [["delete"], ["eq", "meeting_id", "m1"]] },
      { table: "meetings", steps: [["delete"], ["eq", "id", "m1"]] },
    ]);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Z.13 review 4: the filer's read filters in the query, so items that can
// never be filed (an archived meeting, a shadow run) are not read and cannot
// fill the window; and the crm driver sets an archived meeting's items aside.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());

const { dismissArchivedMeetingActions, meetingActionsToFile } = await import("./filing");

beforeEach(() => resetFake());

describe("meetingActionsToFile", () => {
  it("joins the meeting and its live run in the query, not after it", async () => {
    script("meeting_action_items", { data: [] });
    await meetingActionsToFile({ limit: 50 });
    const read = calls.find((c) => c.table === "meeting_action_items")!;
    expect(read.filters).toEqual(
      expect.arrayContaining([
        ["is", "meeting.archived_at", null],
        ["not", "meeting.company_id", "is", null],
        ["eq", "meeting.meeting_followups.mode", "live"],
        ["eq", "origin", "meeting-actions"],
        ["is", "task_id", null],
      ]),
    );
  });
});

describe("dismissArchivedMeetingActions", () => {
  it("sets the waiting items of archived meetings aside, and nothing when there are none", async () => {
    script("meeting_action_items", { data: [{ id: "i1" }, { id: "i2" }] }, { data: null });
    expect(await dismissArchivedMeetingActions()).toBe(2);
    const write = calls.filter((c) => c.table === "meeting_action_items")[1];
    expect(write.ops[0]).toBe("update");
    expect(write.payloads[0]).toMatchObject({ file_state: "dismissed" });
    expect(write.filters).toEqual(expect.arrayContaining([["in", "id", ["i1", "i2"]]]));

    resetFake();
    script("meeting_action_items", { data: [] });
    expect(await dismissArchivedMeetingActions()).toBe(0);
    expect(calls).toHaveLength(1);
  });
});

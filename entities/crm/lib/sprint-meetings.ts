import { readOr } from "@/kernel/data/read";
import type { SprintMeetings } from "@/entities/boards";
import { recentMeetings } from "./meeting-records";
import { draftSprintBriefFromMeeting } from "./sprint-meetings-actions";

/**
 * What boards' sprint page offers about meetings (the sprintMeetings slot,
 * ADR 0032): the forty most recent dated meetings for the picker, and the
 * action that drafts the brief from the one attached. A failed read leaves the
 * picker empty, which the page shows as no meeting to choose rather than an
 * error; attaching and saving still work.
 */
export async function sprintMeetings(): Promise<SprintMeetings> {
  const rows = readOr(await recentMeetings(40), "[crm] recent meetings for the sprint picker", []);
  return {
    options: rows.map((m) => ({ id: m.id, title: m.title || "Untitled meeting", started_at: m.started_at })),
    draftBrief: draftSprintBriefFromMeeting,
  };
}

"use server";

import { boardClientName, boardMutation, type SprintBriefDraftResult } from "@/entities/boards";
import { extractSprintBrief } from "./sprint-extract";

// Drafts a sprint's brief from the meeting attached to it: this client's slice
// of the transcript, returned for review; saving is boards' updateSprintBrief,
// called by the person after they read it. The transcript is crm's, so the
// action is crm's (ADR 0032: boards no longer requires crm), and it is gated
// on the sprint's board exactly as boards' own sprint actions are.
export async function draftSprintBriefFromMeeting(sprintId: string): Promise<SprintBriefDraftResult> {
  // No type argument on the call: check-action-auth reads `await boardMutation(`
  // literally, and `boardMutation<…>(` would hide the guard from it.
  const gate = await boardMutation({ table: "sprints", id: sprintId, select: "board_id, meeting_id", label: "sprint" });
  if (!gate.ok) return gate;
  const sprint = gate.row as { board_id: string; meeting_id: string | null };
  if (!sprint.meeting_id) return { ok: false, error: "Attach a meeting first." };
  const client = await boardClientName(sprint.board_id);
  if (!client.ok) return client;
  const r = await extractSprintBrief(sprint.meeting_id, client.name);
  if (!r.ok) return r;
  return {
    ok: true,
    draft: {
      goal: r.draft.goal,
      focusImprovement: r.draft.focus_improvement,
      goingWell: r.draft.going_well,
      meetingSummary: r.draft.meeting_summary,
    },
  };
}

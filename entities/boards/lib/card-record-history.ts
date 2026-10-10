"use server";

import { boardMutation } from "./mutation";
import { readAuditPage } from "@/kernel/audit/history-read";
import type { AuditPageResult } from "@/kernel/audit/history";

// The card's audit trail, for the card drawer's History tab (S.4).
//
// It is deliberately NOT in card-history.ts. That file reads task_stage_log and
// its whole point is that it never selects `moved_by` and its row type has no
// field a person could be rendered from — tests enforce both. This is the other
// question: what was written to the card row, and by whom, which is what the
// audit trail has always recorded and what S.4 exists to surface. Keeping them
// in separate files keeps that file's invariant readable instead of qualified.
//
// The house rule still holds here: one card's own history, never a list, and
// nothing that groups audit rows by actor.

/**
 * One page of one card's audit trail.
 *
 * The guard comes first, through `boardMutation` on the card's own row, so
 * someone who cannot reach the board cannot learn its history either — and a
 * card that is missing and a card that is out of reach answer the same.
 */
export async function getCardRecordHistory(taskId: string, offset: number, limit: number): Promise<AuditPageResult> {
  const gate = await boardMutation({ table: "tasks", id: taskId, select: "board_id", label: "card" });
  if (!gate.ok) return { ok: false, error: gate.error };
  return readAuditPage("tasks", taskId, offset, limit);
}

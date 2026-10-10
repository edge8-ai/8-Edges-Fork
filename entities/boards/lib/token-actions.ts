"use server";

// The Human Tokens action, split from actions.ts for the file-size gate. Its first
// statement is `boardMutation`, so it is gated exactly as the actions in actions.ts.
// The rule it applies lives in card-estimate.ts (A.29.2): subtasks carry the atoms,
// and a card with sized subtasks is worth their sum.

import { type Result } from "@/kernel/data/result";
import { boardMutation } from "./mutation";
import { refresh } from "./card-helpers";
import { setEstimate } from "./card-estimate";
import { NEGATIVE_TOKENS } from "./tokens";

// Set the Human Tokens estimate on a card or a subtask. A typed figure on a card whose
// subtasks are sized is refused here now, not only disabled in the List: the estimate
// module refuses it for every writer. Sizing a subtask re-derives its parent.
export async function setTaskTokens(taskId: string, tokens: number | null, boardSlug: string): Promise<Result> {
  const gate = await boardMutation({ table: "tasks", id: taskId, label: "task" });
  if (!gate.ok) return gate;
  if (tokens !== null && tokens < 0) return { ok: false, error: NEGATIVE_TOKENS };
  const outcome = await setEstimate(taskId, tokens, gate.actor.label);
  if (outcome.ok) {
    refresh(boardSlug);
    return { ok: true };
  }
  if (outcome.stage === "parent") {
    refresh(boardSlug);
    return { ok: false, error: `Subtask saved, but ${outcome.error}` };
  }
  if (outcome.stage === "reverted") {
    refresh(boardSlug);
    return { ok: false, error: `Estimate not saved, because ${outcome.error}. Save again to retry.` };
  }
  return { ok: false, error: outcome.error };
}

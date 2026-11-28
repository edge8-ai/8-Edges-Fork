"use server";

import { companyOs } from "@/kernel/data/supabase";
import { recordAudit } from "@/kernel/audit/audit";
import type { Result } from "@/kernel/data/result";
import { boardMutation } from "./mutation";
import { refresh } from "./card-helpers";
import { firstIssue, resolveThreadInput } from "./schemas";
import { resolveProblem, type ThreadRow } from "./comment-threads";

// Resolve and reopen a comment thread on a card (W.143). Anyone who may comment
// on the card may do either: a thread is the conversation's, not its author's.
// A resolved thread stays where it is in the Activity stream, greyed, with
// "Resolved by <name>" — never hidden and never folded (the house rule).
//
// The card is named alongside the comment because the guard has to come first
// and resolves the board from a card; the comment is then checked to be on
// that card, so a comment id from another board is refused, not resolved.
export async function resolveThread(taskId: string, commentId: string, resolved: boolean, boardSlug: string): Promise<Result> {
  const gate = await boardMutation({ table: "tasks", id: taskId, label: "card" });
  if (!gate.ok) return gate;
  const { actor } = gate;
  const parsed = resolveThreadInput.safeParse({ commentId, resolved });
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error.issues) };

  const { data: comment, error: readErr } = await companyOs
    .from("task_comments")
    .select("task_id, parent_comment_id, resolved_at")
    .eq("id", commentId)
    .maybeSingle();
  if (readErr) return { ok: false, error: `Could not load the thread: ${readErr.message}` };
  const problem = resolveProblem(comment as ThreadRow | null, taskId);
  if (problem) return { ok: false, error: problem };

  // Resolving a thread someone else resolved a moment ago keeps their name on
  // it: the second click changes nothing, so it writes nothing.
  const already = Boolean((comment as { resolved_at: string | null }).resolved_at);
  if (already === parsed.data.resolved) return { ok: true };

  const patch = parsed.data.resolved
    ? { resolved_at: new Date().toISOString(), resolved_by_person_id: actor.personId, resolved_by_label: actor.label }
    : { resolved_at: null, resolved_by_person_id: null, resolved_by_label: null };
  const { error } = await companyOs.from("task_comments").update(patch).eq("id", commentId).eq("task_id", taskId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({
    table: "task_comments",
    recordId: commentId,
    operation: "update",
    actor: actor.label,
    newData: patch,
    context: { action: parsed.data.resolved ? "resolve_thread" : "reopen_thread" },
  });
  refresh(boardSlug);
  return { ok: true };
}

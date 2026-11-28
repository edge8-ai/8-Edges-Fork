import { revalidatePath } from "next/cache";
import { chainMode, runApplicationNow, runRequisitionNow } from "./run";
import type { ActionResult, Actor, Next } from "./approvals";

// What the hiring chain's two action files share (Z.9): who acts, whether the
// chain may act at all, running the step a decision moved a row to, and the
// pages to refresh. Not an action file: its exports take no input from a
// browser and carry no guard, because both callers have guarded first.

export const SHADOW_REFUSAL =
  "The hiring chain is in shadow: it proposes and drafts, and asks, sends and moves nothing. Turn it live on Settings → Agents first.";

/** null when the chain may act; the reason otherwise. A failed switch read refuses rather than guess. */
export async function refuseUnlessLive(): Promise<string | null> {
  try {
    return (await chainMode()) === "shadow" ? SHADOW_REFUSAL : null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export function actorOf(access: { personId: string | null; user: { email?: string | null } }): Actor {
  return { personId: access.personId, email: access.user.email ?? "unknown" };
}

/** Runs the step a decision moved the row to, so the person sees it move; a failure is the driver's to retry. */
export async function runNext(result: ActionResult, requestedBy: string | null = null): Promise<ActionResult> {
  if (!result.ok || !result.next) return result;
  const step = result.next.application
    ? await runApplicationNow(result.next.application)
    : result.next.requisition
      ? await runRequisitionNow(result.next.requisition, undefined, requestedBy)
      : null;
  refreshChainPages(result.next);
  if (!step || "skipped" in step || step.ok) return { ok: true, notice: result.notice ?? (step && "ok" in step && step.ok ? step.summary : undefined) };
  return { ok: true, notice: `Saved. The next step did not finish and will be retried by the hiring driver: ${step.error}` };
}

export function refreshChainPages(_next?: Next): void {
  revalidatePath("/admin/talent/jobs/[id]", "page");
  revalidatePath("/admin/talent/applications/[id]", "page");
  revalidatePath("/team/approvals");
  revalidatePath("/admin");
}

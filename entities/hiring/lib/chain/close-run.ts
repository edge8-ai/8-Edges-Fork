import { decisionSubject, withdrawAsk } from "./ask";
import type { ChainApplication, ChainDeps } from "./types";

// Ending one application's run (Z.9): on archive, on requisition close, on a
// decision made by hand, and by the application machine's own guards. Split
// from ./application so the machine stays its steps.

/** A run that has recorded its decision and only has the message left to send. */
export function decisionInFlight(app: Pick<ChainApplication, "step">): boolean {
  return app.step === "decide" || app.step === "send";
}

/**
 * Close one application's run: withdraw the message and decision approvals
 * pending on it, withdraw its unsent drafts, and mark it closed. Used on
 * archive, on requisition close, on a decision made by hand, and by the
 * archived guard above. An approved decision's message is never withdrawn:
 * its decision is recorded and the candidate is told (review finding 6), and
 * callers leave a run at decide or send alone. A decline the chain recorded
 * is already claimed (sending) before its rejection is written, so it is out
 * of reach here; an approved decline whose candidate a person decided by
 * hand is withdrawn, so nobody hears twice.
 */
export async function closeApplicationRun(deps: ChainDeps, app: ChainApplication, by: string | null, reason: string): Promise<void> {
  for (const m of await deps.store.messages(app.id)) {
    if (m.mode !== "live" || (m.status !== "pending" && m.status !== "approved")) continue;
    if ((m.kind === "decision_hire" || m.kind === "decision_reject") && m.status === "approved") continue;
    await withdrawAsk(deps, "hiring_message", m.id, { id: app.id, epoch: app.epoch, what: `message-${m.id}` }, by, reason);
    await deps.store.updateMessage(m.id, { status: "withdrawn", error: reason }, { status: ["pending", "approved"] });
  }
  if (app.proposal) {
    await withdrawAsk(deps, decisionSubject(app.proposal.outcome), app.id, { id: app.id, epoch: app.epoch, what: `decision-${app.proposal.proposedAt}` }, by, reason);
  }
  await deps.store.setApplication(app.id, { step: "closed", proposal: null }, { step: app.step });
}

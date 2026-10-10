import { closeRequisitionRun, type Actor } from "./approvals";
import { closeApplicationRun, decisionInFlight } from "./close-run";
import { chainDeps } from "./deps";

// Ending a run from outside the chain (Z.9, spec sections 3a and 3c): an
// application archived or decided by hand, a requisition closed. What waited
// on the approver for it is withdrawn, so no message goes out for a candidate
// or a role that is no longer being considered. A run at decide or send has
// its decision recorded and still tells the candidate (review finding 6).
// Called after the archive, the decision or the close has landed, by actions
// that have already guarded. Never raises: that write stands, and a failure
// here is logged; the hiring driver's sweep closes a decided run on its next
// tick anyway.

async function closeOne(applicationId: string, by: Actor, why: string): Promise<void> {
  try {
    const app = await chainDeps.store.application(applicationId);
    if (!app?.step || app.step === "closed" || decisionInFlight(app)) return;
    await closeApplicationRun(chainDeps, app, by.personId, why);
  } catch (err) {
    console.error(`[hiring/chain] ${applicationId}: could not close the run (${why}):`, err instanceof Error ? err.message : err);
  }
}

export async function closeChainForArchived(applicationId: string, by: Actor): Promise<void> {
  await closeOne(applicationId, by, `The application was archived by ${by.email}.`);
}

/**
 * A person set hired, rejected or withdrawn directly (an application from
 * before Z.9, or any application while the chain is in shadow): its run ends,
 * so nothing the chain drafted or proposed for it goes out later (review finding 1).
 */
export async function closeChainForDecided(applicationId: string, status: string, by: Actor): Promise<void> {
  await closeOne(applicationId, by, `${by.email} set the application to ${status} by hand.`);
}

export async function closeChainForRequisition(requisitionId: string, by: Actor): Promise<void> {
  try {
    await closeRequisitionRun(chainDeps, requisitionId, by);
  } catch (err) {
    console.error(`[hiring/chain] ${requisitionId}: could not close the run after closing the requisition:`, err instanceof Error ? err.message : err);
  }
}

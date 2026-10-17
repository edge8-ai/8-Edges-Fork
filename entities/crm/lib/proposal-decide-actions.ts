"use server";

import { recordAudit } from "@/kernel/audit/audit";
import { requirePermission } from "@/kernel/identity/access-request";
import { revalidateSurfaces } from "@/kernel/shell/surface";
import { approveProposal, rejectProposal } from "./proposal-approval";
import { openingMode, runNow } from "./proposal-chain";
import { loadDraft } from "./proposal-data";
import { askContextFor } from "./proposal-outward";

// The Revenue approver's decision (Z.10, decision 7): approve and publish, or
// reject. Held by crm.proposal-approve alone, the atom of the one-person
// Revenue approver role, never by crm.pipeline, which every Revenue member and
// admin holds. A Revenue member who opens the page sees no buttons, and these
// guards refuse them if they call anyway.

type ActionResult = { ok: true; note?: string } | { ok: false; error: string };

const REASON_MAX = 1000;

function refresh(id: string) {
  revalidateSurfaces(`/revenue/proposals/${id}`);
  revalidateSurfaces("/revenue/meetings");
}

/**
 * Approve the version the page showed, then publish it at once. Publishing
 * waits when the chain is not Live; the driver publishes it on its next live
 * tick, and a failed publish is retried there too.
 */
export async function approveProposalAction(id: string, seenVersion: string): Promise<ActionResult> {
  const access = await requirePermission("crm.proposal-approve");
  const by = { personId: access.personId, email: access.user.email };
  const row = await loadDraft(id);
  if (!row) return { ok: false, error: "Proposal not found." };
  const decided = await approveProposal(id, seenVersion, by, await askContextFor(row));
  refresh(id);
  if (!decided.ok) return decided;
  await recordAudit({ table: "proposal_drafts", recordId: id, operation: "update", actor: by.email, context: { approved: seenVersion } });
  if ((await openingMode()) !== "live") {
    return { ok: true, note: "Approved. The chain is not Live, so it publishes when the switch on Settings → Agents is set to Live." };
  }
  const ran = await runNow(id);
  refresh(id);
  if ("skipped" in ran) return { ok: true, note: `Approved. ${ran.skipped} It publishes on the next tick.` };
  if (!ran.ok) return { ok: true, note: `Approved, but publishing failed: ${ran.error} It is retried on the next tick.` };
  return { ok: true, note: "Approved and published." };
}

/** Reject the proposal: nothing is published, and the run closes. */
export async function rejectProposalAction(id: string, reason: string): Promise<ActionResult> {
  const access = await requirePermission("crm.proposal-approve");
  const by = { personId: access.personId, email: access.user.email };
  const why = reason.trim().slice(0, REASON_MAX) || null;
  const res = await rejectProposal(id, by, why);
  refresh(id);
  if (!res.ok) return res;
  await recordAudit({ table: "proposal_drafts", recordId: id, operation: "update", actor: by.email, context: { rejected: true, reason: why } });
  return { ok: true, note: "Rejected. Nothing was published." };
}

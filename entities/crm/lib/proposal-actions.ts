"use server";

import { recordAudit } from "@/kernel/audit/audit";
import { requirePermission } from "@/kernel/identity/access-request";
import { revalidateSurfaces } from "@/kernel/shell/surface";
import { reaskAfterChange } from "./proposal-approval";
import { applyCrmPatch } from "./proposal-crm-patch";
import { loadDraft } from "./proposal-data";
import { editProposal, type ProposalEdit } from "./proposal-edit";
import { askContextFor } from "./proposal-outward";

// The review page's working actions (Z.10), held by whoever works the
// pipeline: apply the CRM changes a call implies, and edit the proposal before
// the Revenue approver decides. Deciding is crm.proposal-approve's
// (./proposal-decide-actions); starting and stopping a run is crm.calls'
// (./proposal-run-actions).

type ActionResult = { ok: true; note?: string } | { ok: false; error: string };

function refresh(id: string) {
  revalidateSurfaces(`/revenue/proposals/${id}`);
  revalidateSurfaces("/revenue/meetings");
}

/** Apply the ticked CRM changes. Never automatic; the chain only proposes them (decision 4). */
export async function applyProposalCrmChanges(id: string, picked: string[]): Promise<ActionResult> {
  const access = await requirePermission("crm.pipeline");
  const row = await loadDraft(id);
  if (!row) return { ok: false, error: "Proposal not found." };
  if (row.mode === "shadow") return { ok: false, error: "A shadow draft offers no CRM changes to apply." };
  const by = { personId: access.personId, email: access.user.email };
  const res = await applyCrmPatch(id, picked, by);
  await recordAudit({ table: "proposal_drafts", recordId: id, operation: "update", actor: by.email, context: { crmApplied: res.applied ?? [], ok: res.ok } });
  // A deal chosen or created changes where the proposal goes, so a pending
  // approval is asked again for the version that names it.
  if (res.dealChanged) {
    const latest = await loadDraft(id);
    if (latest && (latest.step === "ready" || latest.step === "publish")) {
      const asked = await reaskAfterChange(id, await askContextFor(latest), by, "The proposal's deal changed after approval was asked for.");
      if (!asked.ok) {
        refresh(id);
        return { ok: false, error: `Applied, but the approval could not be asked for again: ${asked.error}` };
      }
    }
  }
  refresh(id);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, note: `Applied ${res.applied?.length ?? 0} change${res.applied?.length === 1 ? "" : "s"}.` };
}

/** Save an edit of one section (or the headline). The version changes, so the approval is asked again. */
export async function saveProposalEdit(id: string, edit: ProposalEdit, seenVersion: string): Promise<ActionResult & { version?: string }> {
  const access = await requirePermission("crm.pipeline");
  const res = await editProposal(id, edit, seenVersion, { personId: access.personId, email: access.user.email });
  refresh(id);
  if (!res.ok) return res;
  return { ok: true, version: res.version, note: res.version === seenVersion ? "Nothing changed." : `Saved as version ${res.version}; approval is asked again for it.` };
}

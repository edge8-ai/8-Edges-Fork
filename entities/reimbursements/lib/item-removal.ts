// Taking a receipt off its owner's claim (plan §10, migration
// 20261008090000): "Once submitted, receipts and red invoices cannot be
// deleted by anyone through the product". From a draft that was never
// submitted the item is deleted with its documents; from a claim that was
// (sent back, or withdrawn to a draft) it is marked removed, with the owner's
// reason, and stays on the claim, counted toward nothing. `ownerCan(claim)
// .remove` says which, and the database refuses the delete on the same fact.
// Split from claim-items.ts, which adds and edits items.
import { receiptWriteError } from "./receipt-freeze";
import type { Result } from "@/kernel/data/result";
import { recordAudit } from "@/kernel/audit/audit";
import { ownerCan } from "./claim-rules";
import { lockedBecause, removeObjects } from "./claim-files";
import { readOwnItem, type ClaimRow } from "./own-claims";
import { selectReimbursementFiles } from "./reads";
import { deleteReimbursementClaimItems, updateReimbursementClaimItems } from "./writes";

/** The reason a blank item reads when its upload never started on a claim that keeps every item. */
const UPLOAD_DID_NOT_START = "upload did not start";

/**
 * Takes the blank item of a refused start off its claim again. It has no
 * document yet (a refused start writes no file row, and a failed signing
 * drops the one it wrote). A draft never submitted loses it; a claim that was
 * ever submitted keeps every item it ever had (20261008090000), so there it is
 * marked removed, saying why, rather than deleted by a write the database
 * refuses. Either failing is logged: the person already hears why the upload
 * did not start, and the blank item shows on the claim to be removed by hand.
 */
export async function takeOffBlankItem(itemId: string, claim: ClaimRow, personId: string) {
  if (ownerCan(claim).remove === "delete") {
    const { error } = await deleteReimbursementClaimItems().eq("id", itemId).eq("claim_id", claim.id).select("id");
    if (error) console.error("[reimbursements] removing a dropped receipt whose upload was refused", error.message);
    return;
  }
  const marked = await markRemoved({ itemId, claimId: claim.id, personId, reason: UPLOAD_DID_NOT_START });
  if (!marked.ok) console.error("[reimbursements] marking removed a dropped receipt whose upload was refused", marked.error);
}

/** What the owner hears when a receipt of a claim ever submitted would be deleted. */
const KEPT_ITEM = "This claim was submitted before, so its receipts are kept for ten years: remove this one with a reason instead.";
const DELETE_INSTEAD = "This draft was never submitted, so the receipt can simply be deleted.";
/** Postgres's raise_exception: the retention guard refused the delete. */
const GUARD_REFUSED = "P0001";

/**
 * Deletes an item and its documents from a draft that was never submitted.
 * From a claim that was, it refuses and says to mark it removed instead
 * (`markClaimItemRemoved`): the database refuses that delete too, and its
 * refusal (a claim submitted from another tab in between) reads the same.
 * The row goes first (the cascade takes its file rows), then the objects
 * those rows named.
 */
export async function removeClaimItem(input: { itemId: string; personId: string }): Promise<Result> {
  const item = await readOwnItem(input.itemId, input.personId);
  if (!item.ok) return item;
  const locked = lockedBecause(item.value.claim);
  if (locked) return { ok: false, error: locked };
  if (ownerCan(item.value.claim).remove !== "delete") return { ok: false, error: KEPT_ITEM };
  const { data: files, error: filesError } = await selectReimbursementFiles("storage_path").eq("claim_item_id", input.itemId);
  if (filesError) return { ok: false, error: `Could not remove the receipt: ${filesError.message}` };
  const { data, error } = await deleteReimbursementClaimItems().eq("id", input.itemId).eq("claim_id", item.value.claim.id).select("id");
  if (error) return { ok: false, error: (error as { code?: string }).code === GUARD_REFUSED ? KEPT_ITEM : error.message };
  if ((data ?? []).length === 0) return { ok: false, error: "That receipt is no longer on the claim." };
  await removeObjects((files ?? []).map((f) => String(f.storage_path)));
  return { ok: true };
}

/**
 * Marks an item removed: it stays on the claim with its documents, shown as
 * removed with who and why, and counts toward nothing (retention-rules
 * `stillCounted`). Guarded on not being removed already, so a second click
 * keeps the first reason. Audited: the row's own columns say who and when,
 * the audit row says it happened.
 */
async function markRemoved(input: { itemId: string; claimId: string; personId: string; reason: string }): Promise<Result> {
  const patch = { removed_at: new Date().toISOString(), removed_by: input.personId, remove_reason: input.reason };
  const { data, error } = await updateReimbursementClaimItems(patch).eq("id", input.itemId).eq("claim_id", input.claimId).is("removed_at", null).select("id");
  if (error) return { ok: false, error: receiptWriteError(error, `Could not remove the receipt: ${error.message}`) };
  if ((data ?? []).length === 0) return { ok: false, error: "That receipt is already removed, or no longer on the claim." };
  await recordAudit({
    table: "reimbursement_claim_items",
    recordId: input.itemId,
    operation: "update",
    actor: null,
    newData: { removed: true, reason: input.reason },
    context: { claimId: input.claimId, move: "remove_item", personId: input.personId },
  });
  return { ok: true };
}

/**
 * Takes a receipt off a claim that was ever submitted (sent back, or
 * withdrawn to a draft), which keeps it: the owner says why, and it is marked
 * removed rather than deleted (plan §10). A draft never submitted deletes it
 * instead (`removeClaimItem`), so this refuses there.
 */
export async function markClaimItemRemoved(input: { itemId: string; personId: string; reason: string }): Promise<Result> {
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "Say why you are removing this receipt." };
  if (reason.length > 1000) return { ok: false, error: "Keep the reason under 1,000 characters." };
  const item = await readOwnItem(input.itemId, input.personId);
  if (!item.ok) return item;
  const locked = lockedBecause(item.value.claim);
  if (locked) return { ok: false, error: locked };
  if (ownerCan(item.value.claim).remove !== "mark") return { ok: false, error: DELETE_INSTEAD };
  if (item.value.removed) return { ok: false, error: "That receipt is already removed." };
  return markRemoved({ itemId: input.itemId, claimId: item.value.claim.id, personId: input.personId, reason });
}

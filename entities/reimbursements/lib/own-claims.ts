// The reads of a claim, an item and a file that the actions start from, after
// their guard (ADR 0007), and the owner's write gate built on them (A.37). An
// owner's read is filtered to the signed-in person's own claims in the query
// itself, so a guessed id from someone else's claim reads as "not found",
// never as somebody's receipt; a decider's claim read is unscoped, and says so
// at its call site.
import { selectReimbursementClaimItems, selectReimbursementClaims, selectReimbursementFiles } from "./reads";
import { isClaimStatus, ownerCan, standing, type ClaimStatus } from "./claim-rules";

/** A claim as the lifecycle reads it. */
export type ClaimRow = { id: string; status: ClaimStatus; personId: string; title: string; submittedAt: string | null };

/** The columns a caller selects so it can hand the row to the lifecycle. */
export const CLAIM_ROW_COLUMNS = "id, status, person_id, title, submitted_at";

export function claimRowFrom(r: Record<string, unknown>): ClaimRow {
  const status = String(r.status);
  if (!isClaimStatus(status)) throw new Error(`reimbursement claim ${String(r.id)} has an unknown status: ${status}`);
  return {
    id: String(r.id),
    status,
    personId: String(r.person_id),
    title: String(r.title ?? ""),
    submittedAt: (r.submitted_at as string | null) ?? null,
  };
}

/** A read the caller cannot act on: the database refused, or the row is not the owner's. */
export type OwnRead<T> = { ok: true; value: T } | { ok: false; error: string };

const NOT_FOUND = { ok: false as const, error: "Claim not found." };

/**
 * One claim as the lifecycle reads it, as its owner may (`ownedBy`, filtered
 * in the query, so another person's claim is "not found") or as a decider
 * may (no scope: the caller's guard is a permission whose reach is every
 * claim, design §1.5). The same scope parameter `readClaimDetail` takes, so
 * every unscoped read says so at its call site.
 */
export async function readClaimRow(claimId: string, scope: { ownedBy?: string }): Promise<OwnRead<ClaimRow>> {
  const one = selectReimbursementClaims(CLAIM_ROW_COLUMNS).eq("id", claimId);
  const { data, error } = await (scope.ownedBy ? one.eq("person_id", scope.ownedBy) : one).maybeSingle();
  if (error) return { ok: false, error: `Could not read the claim: ${error.message}` };
  return data ? { ok: true, value: claimRowFrom(data) } : NOT_FOUND;
}

/**
 * An item with the claim it belongs to, whether its owner removed it (it stays
 * on the claim, kept as it was), and the currency it was paid in, which decides
 * whether it can carry a bank deduction (RB.20).
 */
export type OwnItem = { id: string; removed: boolean; currency: string; claim: ClaimRow };

async function readOwnItem(itemId: string, personId: string): Promise<OwnRead<OwnItem>> {
  const { data, error } = await selectReimbursementClaimItems(`id, removed_at, currency, reimbursement_claims!inner(${CLAIM_ROW_COLUMNS})`)
    .eq("id", itemId)
    .eq("reimbursement_claims.person_id", personId)
    .maybeSingle();
  if (error) return { ok: false, error: `Could not read the item: ${error.message}` };
  if (!data) return NOT_FOUND;
  return {
    ok: true,
    value: {
      id: String(data.id),
      removed: data.removed_at !== null && data.removed_at !== undefined,
      currency: String(data.currency ?? "vnd"),
      claim: claimRowFrom(data.reimbursement_claims as Record<string, unknown>),
    },
  };
}

/** A file with its item's claim. */
export type OwnFile = {
  id: string;
  kind: string;
  storagePath: string;
  filename: string;
  confirmed: boolean;
  itemId: string;
  claim: ClaimRow;
};

async function readOwnFile(fileId: string, personId: string): Promise<OwnRead<OwnFile>> {
  const { data, error } = await selectReimbursementFiles(
    `id, kind, storage_path, filename, confirmed_at, claim_item_id, reimbursement_claim_items!inner(reimbursement_claims!inner(${CLAIM_ROW_COLUMNS}))`,
  )
    .eq("id", fileId)
    .eq("reimbursement_claim_items.reimbursement_claims.person_id", personId)
    .maybeSingle();
  if (error) return { ok: false, error: `Could not read the file: ${error.message}` };
  if (!data) return NOT_FOUND;
  const item = data.reimbursement_claim_items as Record<string, unknown>;
  return {
    ok: true,
    value: {
      id: String(data.id),
      kind: String(data.kind),
      storagePath: String(data.storage_path),
      filename: String(data.filename),
      confirmed: data.confirmed_at !== null && data.confirmed_at !== undefined,
      itemId: String(data.claim_item_id),
      claim: claimRowFrom(item.reimbursement_claims as Record<string, unknown>),
    },
  };
}

// What the owner is about to do to the target. An edit needs the claim open;
// a removal also needs the claim's own kind of removal, because a claim that
// was ever submitted keeps its receipts and documents for ten years and only
// marks them, while a draft never submitted simply deletes them. A confirm is
// an edit, except that a document already confirmed is only handed back: a
// repeated confirm returns its kind (RB.20) and changes nothing. A read (a
// download, or clearing an upload that never finished) changes no part of the
// claim, so no lock applies to it.
export type OwnerNeed = "read" | "edit" | "delete" | "mark" | "confirm";

/**
 * Why the owner may not change this claim's receipts and documents now, or
 * null when they may. Worded from `standing`, so the lock names a claim as its
 * badge does: a checked claim waits for approval, it is never "checked"
 * (A.37). Private to the gate, so no write can build its own lock.
 */
function ownerLockedBecause(claim: { status: ClaimStatus; submittedAt: string | null }): string | null {
  if (ownerCan(claim).edit) return null;
  if (claim.status === "submitted") return "This claim is submitted. Withdraw it to change it.";
  // The badge says "In payment run"; a sentence needs the article.
  const where = claim.status === "in_run" ? "in a payment run" : standing(claim.status);
  return `This claim is ${where}, so its documents are kept as they are.`;
}

// Also what a refused delete of a kept receipt or document says, so the
// database trigger's refusal reads as the gate's does.
export const KEPT_ITEM = "This claim was submitted before, so its receipts are kept for ten years: remove this one with a reason instead.";
const DELETE_ITEM_INSTEAD = "This draft was never submitted, so the receipt can simply be deleted.";
export const KEPT_DOCUMENT = "This claim was submitted before, so its documents are kept for ten years: mark this one replaced instead, then add the new one.";
const REMOVE_DOCUMENT_INSTEAD = "This draft was never submitted, so the document can simply be removed.";

function removalRefusal(target: OwnTarget, value: ClaimRow | OwnItem | OwnFile, need: OwnerNeed): string | null {
  if (need === "read" || need === "edit" || need === "confirm") return null;
  const claim = "claim" in value ? value.claim : value;
  const removal = ownerCan(claim).remove;
  if ("fileId" in target) {
    // An upload that never finished is not yet a document of the claim, so it
    // can go from any claim the owner may change.
    if (need === "delete") return (value as OwnFile).confirmed && removal !== "delete" ? KEPT_DOCUMENT : null;
    return removal === "mark" ? null : REMOVE_DOCUMENT_INSTEAD;
  }
  if (need === "delete") return removal === "delete" ? null : KEPT_ITEM;
  return removal === "mark" ? null : DELETE_ITEM_INSTEAD;
}

export type OwnTarget = { claimId: string } | { itemId: string } | { fileId: string };

/**
 * How an owner's write to a claim's receipts, its documents or its trip
 * begins (A.37): the target read as its owner may read it (another person's
 * reads as "not found"), the claim's lock in the words its badge uses, and
 * for a removal whether this claim deletes or marks. Before A.37 each of nine
 * writes assembled those steps itself, and the lock's wording had drifted
 * from the badge's. Returns the target with its claim, or the refusal to hand
 * back unchanged. The claim's own moves (submit, withdraw, deleting a draft)
 * are not here: they start from `readClaimRow` and the lifecycle decides them.
 *
 * Each target takes only the needs that mean something for it: a claim is
 * edited (its trip, a new receipt), a receipt is edited or removed, and only a
 * document is read, confirmed or replaced.
 */
export async function openForOwner(target: { claimId: string }, personId: string, need: "edit"): Promise<OwnRead<ClaimRow>>;
export async function openForOwner(target: { itemId: string }, personId: string, need: "edit" | "delete" | "mark"): Promise<OwnRead<OwnItem>>;
export async function openForOwner(target: { fileId: string }, personId: string, need: OwnerNeed): Promise<OwnRead<OwnFile>>;
export async function openForOwner(target: OwnTarget, personId: string, need: OwnerNeed): Promise<OwnRead<ClaimRow | OwnItem | OwnFile>> {
  const read: OwnRead<ClaimRow | OwnItem | OwnFile> =
    "claimId" in target
      ? await readClaimRow(target.claimId, { ownedBy: personId })
      : "itemId" in target
        ? await readOwnItem(target.itemId, personId)
        : await readOwnFile(target.fileId, personId);
  if (!read.ok || need === "read") return read;
  if (need === "confirm" && "fileId" in target && (read.value as OwnFile).confirmed) return read;
  const claim = "claim" in read.value ? read.value.claim : read.value;
  const locked = ownerLockedBecause(claim);
  if (locked) return { ok: false, error: locked };
  const refused = removalRefusal(target, read.value, need);
  return refused ? { ok: false, error: refused } : read;
}

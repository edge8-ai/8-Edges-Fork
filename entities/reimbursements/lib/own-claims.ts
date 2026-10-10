// The reads of a claim, an item and a file that the actions start from, after
// their guard (ADR 0007). The owner's are filtered to the signed-in person's
// own claims in the query itself, so a guessed id from someone else's claim
// reads as "not found", never as somebody's receipt; a decider's claim read
// is unscoped, and says so at its call site.
import { selectReimbursementClaimItems, selectReimbursementClaims, selectReimbursementFiles } from "./reads";
import { isClaimStatus, type ClaimStatus } from "./claim-rules";

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

/** An item with the claim it belongs to, and whether its owner removed it (it stays on the claim, kept as it was). */
export type OwnItem = { id: string; removed: boolean; claim: ClaimRow };

export async function readOwnItem(itemId: string, personId: string): Promise<OwnRead<OwnItem>> {
  const { data, error } = await selectReimbursementClaimItems(`id, removed_at, reimbursement_claims!inner(${CLAIM_ROW_COLUMNS})`)
    .eq("id", itemId)
    .eq("reimbursement_claims.person_id", personId)
    .maybeSingle();
  if (error) return { ok: false, error: `Could not read the item: ${error.message}` };
  if (!data) return NOT_FOUND;
  return {
    ok: true,
    value: { id: String(data.id), removed: data.removed_at !== null && data.removed_at !== undefined, claim: claimRowFrom(data.reimbursement_claims as Record<string, unknown>) },
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

export async function readOwnFile(fileId: string, personId: string): Promise<OwnRead<OwnFile>> {
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

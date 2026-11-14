// Joining a document that came in on its own to its receipt, and taking it
// off again (RB.26). A bank deduction or a red invoice dropped on its own is a
// row of its own; its owner joins it to the receipt it belongs to, picked from
// the receipts the rules offer (join-rules.ts). Join moves the file onto the
// receipt; a bank deduction also values the receipt at the dong the bank took,
// which is always what is paid (RB.20, claim-rules itemValue), and a red
// invoice is read again on the receipt, where its buyer is checked (RB.9).
// The emptied row comes off the claim the way the claim takes a receipt off:
// deleted from a draft never submitted, marked removed on one that was (plan
// §10). Unjoin is the reverse, for one file: it goes back to a row of its own,
// and a receipt that lost its deduction is valued at the bank's rate again.
//
// Moving a file between two rows of one claim needs no schema change: no
// trigger reads `claim_item_id` on an update (20261007120000, 20261010030000),
// and the claim must be its owner's to change, which `openForOwner` checks.
// The steps are separate writes, so each is audited the moment it lands, and a
// later step that fails says what already happened and what is left to do.
// Not a "use server" file: the owner's actions call it after their guard.
import type { Result } from "@/kernel/data/result";
import type { Json } from "@/kernel/data/supabase/database.types";
import { recordAudit } from "@/kernel/audit/audit";
import { itemValue, ownerCan, type ClaimStatus } from "./claim-rules";
import { addLoneItem, itemLabel, itemValueWithRate, REMOVED_STAYS } from "./claim-items";
import { markClaimItemRemoved, removeClaimItem, takeOffBlankItem } from "./item-removal";
import { hasJoined, joinRefusal, loneKind, type JoinKind } from "./join-rules";
import { fileAsLoneDeduction, isDongDeduction } from "./lone-deduction";
import { openForOwner } from "./own-claims";
import { receiptWriteError } from "./receipt-freeze";
import { readReceipt, readStoredDocument } from "./receipt-reading";
import { selectReimbursementClaimItems, selectReimbursementFiles } from "./reads";
import { updateReimbursementClaimItems, updateReimbursementFiles } from "./writes";

type Refused = { ok: false; error: string };
// A stored document, in the stamp shape the join rules read (JoinDocument); unjoin reads `replacedAt` itself.
type Document = { id: string; kind: string; replacedAt: string | null; filename: string; storagePath: string; mimeType: string };
type Facts = { row: Record<string, unknown>; documents: Document[] };

const ITEM_COLUMNS = "id, seller, description, bought_on, amount_cents, currency, charged_vnd, removed_at";
const KIND_WORD: Record<JoinKind, string> = { bank_deduction: "bank deduction", red_invoice: "red invoice" };

/** The rows named on one claim, with their confirmed documents, as the database holds them now. */
async function factsOf(claimId: string, itemIds: string[]): Promise<{ ok: true; byId: Map<string, Facts> } | Refused> {
  const { data: rows, error } = await selectReimbursementClaimItems(ITEM_COLUMNS).eq("claim_id", claimId).in("id", itemIds);
  if (error) return { ok: false, error: `Could not read the receipts: ${error.message}` };
  const { data: files, error: filesError } = await selectReimbursementFiles("id, kind, claim_item_id, filename, storage_path, mime_type, replaced_at")
    .in("claim_item_id", itemIds)
    .not("confirmed_at", "is", null);
  if (filesError) return { ok: false, error: `Could not read the receipts' documents: ${filesError.message}` };
  const byId = new Map<string, Facts>();
  for (const row of rows ?? []) {
    const documents = (files ?? [])
      .filter((f) => f.claim_item_id === row.id)
      .map((f) => ({
        id: String(f.id),
        kind: String(f.kind),
        replacedAt: (f.replaced_at as string | null) ?? null,
        filename: String(f.filename),
        storagePath: String(f.storage_path),
        mimeType: String(f.mime_type ?? ""),
      }));
    byId.set(String(row.id), { row, documents });
  }
  return { ok: true, byId };
}

const audit = (claimId: string, itemId: string, personId: string, move: string, newData: Record<string, unknown>) =>
  recordAudit({ table: "reimbursement_claim_items", recordId: itemId, operation: "update", actor: null, newData, context: { claimId, move, personId } });

/** Joins a bank deduction or a red invoice that came in on its own to its receipt, on one of the owner's claims. */
export async function joinLoneRow(input: { personId: string; loneItemId: string; receiptItemId: string }): Promise<Result> {
  if (input.loneItemId === input.receiptItemId) return { ok: false, error: "Pick the receipt it belongs to." };
  const opened = await openForOwner({ itemId: input.loneItemId }, input.personId, "edit");
  if (!opened.ok) return opened;
  if (opened.value.removed) return { ok: false, error: "That row was removed from the claim." };
  const claim = opened.value.claim;
  const facts = await factsOf(claim.id, [input.loneItemId, input.receiptItemId]);
  if (!facts.ok) return facts;
  const lone = facts.byId.get(input.loneItemId);
  const receipt = facts.byId.get(input.receiptItemId);
  if (!lone) return { ok: false, error: "That row is no longer on the claim." };
  if (!receipt) return { ok: false, error: "That receipt is not on this claim." };
  const kind = loneKind(lone.documents);
  const paid = Number(lone.row.amount_cents);
  const refusal = joinRefusal({
    lone: { amount: paid, documents: lone.documents },
    receipt: {
      currency: String(receipt.row.currency),
      amount: Number(receipt.row.amount_cents),
      removed: receipt.row.removed_at !== null && receipt.row.removed_at !== undefined,
      documents: receipt.documents,
    },
  });
  if (refusal || !kind) return { ok: false, error: refusal ?? "That row is not a bank deduction or a red invoice on its own." };
  const word = KIND_WORD[kind];
  const receiptLabel = itemLabel(receipt.row);

  // Guarded on the files still being the lone row's current documents of this kind, so a second click moves nothing twice.
  const { data: moved, error: moveError } = await updateReimbursementFiles({ claim_item_id: input.receiptItemId })
    .eq("claim_item_id", input.loneItemId)
    .eq("kind", kind)
    .is("replaced_at", null)
    .not("confirmed_at", "is", null)
    .select("id");
  if (moveError) return { ok: false, error: `Could not join the ${word}: ${moveError.message}` };
  if ((moved ?? []).length === 0) return { ok: false, error: `That ${word} changed while you were working on it. Reload and try again.` };
  const files = (moved ?? []).map((f) => String(f.id));
  await audit(claim.id, input.receiptItemId, input.personId, `join_${kind}`, { joined_from: input.loneItemId, files, ...(kind === "bank_deduction" ? { charged_vnd: paid } : {}) });

  if (kind === "bank_deduction") {
    const value = itemValue({ amount: Number(receipt.row.amount_cents), currency: String(receipt.row.currency), chargedVnd: paid, rate: null });
    const { data: valued, error: valueError } = await updateReimbursementClaimItems(value).eq("id", input.receiptItemId).eq("claim_id", claim.id).select("id");
    if (valueError || (valued ?? []).length === 0) {
      const why = valueError ? receiptWriteError(valueError, valueError.message) : "the receipt changed meanwhile";
      return { ok: false, error: `The bank deduction is now on ${receiptLabel}, but the receipt was not valued at it (${why}). Edit the receipt and save what you are paid.` };
    }
  } else {
    // A red invoice names the buyer the receipt is checked against (RB.9): read it there, best effort.
    const read = await readReceipt(files[0], { onlyIfUnread: true });
    if (!read.ok) console.error("[reimbursements] reading a joined red invoice", read.error);
  }

  const emptied = await takeOffEmptied(input.loneItemId, claim, input.personId, `Joined to ${receiptLabel} as its ${word}.`);
  if (!emptied.ok) return { ok: false, error: `The ${word} is now on ${receiptLabel}, but its old row is still on the claim with no file (${emptied.error}). Remove that row.` };
  return { ok: true };
}

/** Takes a row whose file moved off the claim, as the claim takes a receipt off. */
function takeOffEmptied(itemId: string, claim: { status: ClaimStatus; submittedAt: string | null }, personId: string, reason: string): Promise<Result> {
  return ownerCan(claim).remove === "delete" ? removeClaimItem({ itemId, personId }) : markClaimItemRemoved({ itemId, personId, reason });
}

/**
 * Takes one joined bank deduction or red invoice off its receipt, onto a row
 * of its own. The row is valued at what the bank took for a deduction, and at
 * nothing for a red invoice until its reading fills it in; a receipt that lost
 * its deduction is valued at the bank's selling rate on its date, or rate
 * pending. The file is read again for what it names; a read that fails leaves
 * the row named by its file, which its owner can still join.
 */
export async function unjoinDocument(input: { personId: string; itemId: string; fileId: string }): Promise<Result> {
  const opened = await openForOwner({ itemId: input.itemId }, input.personId, "edit");
  if (!opened.ok) return opened;
  if (opened.value.removed) return { ok: false, error: REMOVED_STAYS };
  const claim = opened.value.claim;
  const facts = await factsOf(claim.id, [input.itemId]);
  if (!facts.ok) return facts;
  const receipt = facts.byId.get(input.itemId);
  const doc = receipt?.documents.find((d) => d.id === input.fileId && d.replacedAt === null);
  const kind = doc && (doc.kind === "bank_deduction" || doc.kind === "red_invoice") ? doc.kind : null;
  if (!receipt || !doc || !kind || !hasJoined(receipt.documents, kind)) return { ok: false, error: "That file is not joined to this receipt." };
  const word = KIND_WORD[kind];
  const paid = kind === "bank_deduction" && receipt.row.charged_vnd !== null && receipt.row.charged_vnd !== undefined ? Number(receipt.row.charged_vnd) : 0;

  const added = await addLoneItem({ claimId: claim.id, personId: input.personId, amountVnd: paid, filename: doc.filename });
  if (!added.ok) return added;
  const { data: moved, error: moveError } = await updateReimbursementFiles({ claim_item_id: added.id }).eq("id", doc.id).eq("claim_item_id", input.itemId).select("id");
  if (moveError || (moved ?? []).length === 0) {
    await takeOffBlankItem(added.id, claim, input.personId, "unjoin did not finish");
    return { ok: false, error: moveError ? `Could not unjoin the ${word}: ${moveError.message}. Nothing moved.` : `That ${word} changed while you were working on it. Reload and try again.` };
  }
  await audit(claim.id, input.itemId, input.personId, `unjoin_${kind}`, { unjoined_to: added.id, files: [doc.id], ...(kind === "bank_deduction" ? { charged_vnd: null } : {}) });

  if (kind === "bank_deduction") {
    const boughtOn = (receipt.row.bought_on as string | null) ?? null;
    const value = await itemValueWithRate({ amount: Number(receipt.row.amount_cents), currency: String(receipt.row.currency), chargedVnd: null, boughtOn }, input.personId);
    const { data: valued, error: valueError } = await updateReimbursementClaimItems(value).eq("id", input.itemId).eq("claim_id", claim.id).select("id");
    if (valueError || (valued ?? []).length === 0) {
      const why = valueError ? receiptWriteError(valueError, valueError.message) : "the receipt changed meanwhile";
      return { ok: false, error: `The bank deduction is back on a row of its own, but ${itemLabel(receipt.row)} still carries its amount (${why}). Edit the receipt and empty what you are paid.` };
    }
    await nameUnjoinedDeduction(doc, added.id, claim.id, paid);
  } else {
    const read = await readReceipt(doc.id);
    if (!read.ok) console.error("[reimbursements] reading an unjoined red invoice", read.error);
  }
  return { ok: true };
}

/** Reads an unjoined bank deduction for the merchant and date the bank printed, best effort. */
async function nameUnjoinedDeduction(doc: Document, itemId: string, claimId: string, paid: number) {
  const read = await readStoredDocument({ id: doc.id, storagePath: doc.storagePath, mimeType: doc.mimeType });
  if (!read.ok) return console.error("[reimbursements] reading an unjoined bank deduction", read.error);
  if (!read.reading || !isDongDeduction(read.reading)) return;
  const stored = { ...read.reading, file_id: doc.id, read_at: new Date().toISOString() } as Json;
  const named = await fileAsLoneDeduction({ fileId: doc.id, itemId, claimId, row: { seller: null, bought_on: null, amount_cents: paid }, reading: read.reading, stored });
  if (named && !named.ok) console.error("[reimbursements] naming an unjoined bank deduction", named.error);
}

// What a file is, as its owner says (RB.26.6). The receipt reader files each
// dropped file as a receipt, a red invoice or a bank deduction, and that read
// is a default, never the last word (Khoa, 2026-11-06: "defaulting is ok, but
// not allowing human override is dumb, human can always change"). In Edit each
// file's kind is a picker set to the AI's read; saving a different kind refiles
// the file, and its row follows the rules every row follows: a bank deduction
// on its own asks to be joined to its receipt (join-rules.ts), and Submit
// refuses it until it is. The checkers still see every file and decide.
//
// The rules a refile keeps are the ones an upload keeps: a red invoice is a
// PDF (claim-files.ts) and only for something bought in Vietnam, in dong; a
// bank deduction beside a receipt goes only with one paid in another currency,
// one per receipt (RB.20). An owner's refile is never undone by a later read:
// the reader files a bank deduction only on a file's first read (its upload)
// and in the one-time pass over photos read before RB.26, never on a re-read
// (receipt-reading `fileDeductions`).
// Not a "use server" file: the owner's action calls it after its guard.
import type { Result } from "@/kernel/data/result";
import { recordAudit } from "@/kernel/audit/audit";
import { RED_INVOICE_MUST_BE_PDF } from "./claim-files";
import { isDocumentKind, type DocumentKind } from "./claim-labels";
import { openForOwner } from "./own-claims";
import { readReceipt } from "./receipt-reading";
import { selectReimbursementClaimItems, selectReimbursementFiles } from "./reads";
import { updateReimbursementFiles } from "./writes";

/**
 * Why this file cannot be filed as `kind` on its receipt, or null when it may.
 * `others` are the receipt's other current documents. Pure.
 */
export function kindRefusal(input: { file: { mimeType: string | null }; kind: DocumentKind; currency: string; others: { kind: string }[] }): string | null {
  const { file, kind, others } = input;
  const dong = input.currency.toLowerCase() === "vnd";
  if (kind === "red_invoice") {
    if (file.mimeType !== "application/pdf") return RED_INVOICE_MUST_BE_PDF;
    if (!dong) return "A red invoice is for something bought in Vietnam, in dong.";
  }
  if (kind === "bank_deduction" && others.length > 0) {
    if (others.some((o) => o.kind === "bank_deduction")) return "That receipt already has its bank deduction.";
    // A dong receipt is its own value, so a deduction beside it proves nothing (RB.20).
    if (dong) return "A bank deduction goes beside a receipt paid in another currency; this receipt is in dong.";
  }
  return null;
}

/** Files one of the owner's documents as the kind they say, on a claim they may still change. */
export async function refileDocument(input: { personId: string; fileId: string; kind: DocumentKind }): Promise<Result> {
  const opened = await openForOwner({ fileId: input.fileId }, input.personId, "edit");
  if (!opened.ok) return opened;
  if (!opened.value.confirmed) return { ok: false, error: "That file hasn't finished uploading." };
  const from = opened.value.kind;
  // A bank's transfer receipt belongs to a payment, never to a receipt, so it is no kind an owner picks.
  if (!isDocumentKind(from)) return { ok: false, error: "That file is not one of a receipt's documents." };
  if (from === input.kind) return { ok: true };
  const { itemId, claim } = opened.value;

  const { data: docs, error } = await selectReimbursementFiles("id, kind, mime_type, replaced_at").eq("claim_item_id", itemId).not("confirmed_at", "is", null);
  if (error) return { ok: false, error: `Could not read the receipt's documents: ${error.message}` };
  const { data: item, error: itemError } = await selectReimbursementClaimItems("currency, removed_at").eq("id", itemId).eq("claim_id", claim.id).maybeSingle();
  if (itemError) return { ok: false, error: `Could not read the receipt: ${itemError.message}` };
  if (!item) return { ok: false, error: "That receipt is no longer on the claim." };
  if (item.removed_at) return { ok: false, error: "This receipt was removed from the claim, so it stays as it was." };
  const self = (docs ?? []).find((d) => d.id === input.fileId);
  if (!self || self.replaced_at) return { ok: false, error: "A replaced file stays as it was." };

  const others = (docs ?? []).filter((d) => d.id !== input.fileId && !d.replaced_at).map((d) => ({ kind: String(d.kind) }));
  const refusal = kindRefusal({ file: { mimeType: (self.mime_type as string | null) ?? null }, kind: input.kind, currency: String(item.currency), others });
  if (refusal) return { ok: false, error: refusal };

  // Guarded on the kind it was read as, so a second save, or a read landing meanwhile, changes nothing twice.
  const { data: refiled, error: refileError } = await updateReimbursementFiles({ kind: input.kind }).eq("id", input.fileId).eq("claim_item_id", itemId).eq("kind", from).select("id");
  if (refileError) return { ok: false, error: `Could not change what the file is: ${refileError.message}` };
  if ((refiled ?? []).length === 0) return { ok: false, error: "That file changed while you were working on it. Reload and try again." };
  await recordAudit({
    table: "reimbursement_files",
    recordId: input.fileId,
    operation: "update",
    actor: null,
    oldData: { kind: from },
    newData: { kind: input.kind },
    context: { claimId: claim.id, itemId, move: "refile_by_owner", personId: input.personId },
  });

  // A red invoice names the buyer its receipt is checked against (RB.9): read it as one, best effort.
  if (input.kind === "red_invoice") {
    const read = await readReceipt(input.fileId, { onlyIfUnread: true });
    if (!read.ok) console.error("[reimbursements] reading a file its owner filed as a red invoice", read.error);
  }
  return { ok: true };
}

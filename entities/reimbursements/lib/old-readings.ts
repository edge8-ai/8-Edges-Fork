// Receipts read before RB.26 (2026-11-06). Until then the receipt reader could
// not tell a bank's record of a payment from a receipt, so a bank screenshot
// dropped on its own was read as a dong receipt, and the claim paid the
// purchase twice: Khoa's November claim carried the Anthropic invoice and its
// Techcombank deduction as two receipts, ₫5,804,842. Such a row is read once
// more when its owner opens the claim, after the page has gone out, so the
// reader can file it as a bank deduction and its row offers Join. A reading
// stored since RB.26 names `is_bank_deduction`, so each row is read again once.
//
// Only rows whose one current document is a photo filed as a receipt are read
// again: a bank screenshot is a photo, and a row with more documents is a
// receipt with its own. Only while the claim is its owner's to change, which
// the caller decides; the reader itself changes no field the owner filled.
// A failed read leaves the row as it is, to be read on the next visit.
import { readOr } from "@/kernel/data/read";
import { readReceipt } from "./receipt-reading";
import { selectReimbursementClaimItems, selectReimbursementFiles } from "./reads";

export async function rereadBeforeDeductions(claimId: string): Promise<void> {
  const items = readOr(
    await selectReimbursementClaimItems("id")
      .eq("claim_id", claimId)
      .is("removed_at", null)
      .not("ai_reading", "is", null)
      .is("ai_reading->>is_bank_deduction", null),
    "[reimbursements] receipts read before RB.26 (they are read again on a later visit)",
    [],
  );
  if (items.length === 0) return;
  const files = readOr(
    await selectReimbursementFiles("id, claim_item_id, kind, mime_type")
      .in("claim_item_id", items.map((i) => String(i.id)))
      .not("confirmed_at", "is", null)
      .is("replaced_at", null),
    "[reimbursements] the documents of receipts read before RB.26",
    [],
  );
  for (const item of items) {
    const own = files.filter((f) => f.claim_item_id === item.id);
    if (own.length !== 1 || own[0].kind !== "receipt" || !String(own[0].mime_type ?? "").startsWith("image/")) continue;
    const read = await readReceipt(String(own[0].id), { fileDeductions: true });
    if (!read.ok) console.error("[reimbursements] reading again a receipt read before RB.26", read.error);
  }
}

// A dropped file the AI reads as a bank deduction (RB.26). Every file goes in
// through the one drop zone, as a new receipt of its own (RB.9), filed as a
// receipt or, for a PDF, a red invoice. When the reading says the file is the
// bank's record of a payment in dong (a banking-app screenshot, a card
// statement line), it is refiled as a bank deduction and its row becomes a
// lone deduction: valued at the dong the bank took, titled by the merchant as
// the bank prints it, and waiting for its owner to join it to the receipt it
// paid for (join-rules.ts). Nothing joins by itself.
//
// Only a row whose one current document is this file becomes a lone
// deduction; a file on a receipt that has any other document, a joined bank
// deduction included, is left as it was read. Only while the claim is its
// owner's to change, and only on a file's first read, which the caller decides
// (receipt-reading `fileDeductions`). Not a "use server" file: its callers have
// run their guard.
import type { Json } from "@/kernel/data/supabase/database.types";
import { recordAudit } from "@/kernel/audit/audit";
import { itemValue } from "./claim-rules";
import { receiptWriteError } from "./receipt-freeze";
import { selectReimbursementFiles } from "./reads";
import { updateReimbursementClaimItems, updateReimbursementFiles } from "./writes";

/** The part of a reading this decides on (receipt-reading.ts ReceiptReading). */
export type DeductionRead = { is_bank_deduction: boolean; amount_minor: number | null; currency: string | null; bought_on: string | null; seller: string | null };

/** Whether a reading is a bank deduction this can value: the bank's record, in dong, with an amount. Pure. */
export function isDongDeduction(r: DeductionRead): boolean {
  return r.is_bank_deduction && (r.currency ?? "").toLowerCase() === "vnd" && r.amount_minor !== null && r.amount_minor > 0;
}

type Refused = { ok: false; error: string };

/** `fileAsLoneDeduction`'s input for a file the receipt reader just read, from its item row as the reader selected it. */
export function justRead(fileId: string, item: Record<string, unknown>, claimId: string, reading: DeductionRead) {
  return {
    fileId,
    itemId: String(item.id),
    claimId,
    row: { seller: (item.seller as string | null) ?? null, bought_on: (item.bought_on as string | null) ?? null, amount_cents: Number(item.amount_cents) },
    reading,
    stored: { ...reading, file_id: fileId, read_at: new Date().toISOString() } as Json,
  };
}

/**
 * Refiles one confirmed file as a bank deduction and fills its row as a lone
 * deduction, or returns null when the row has another current document and
 * so is not this file alone. The row's seller, date and amount are filled only
 * where they are still empty (a dropped row starts with none, and an unjoined
 * row keeps the amount it had on its receipt); `stored` is the reading as it
 * is kept on the row. The caller has decided the reading is a dong deduction
 * and that the owner may change the claim.
 */
export async function fileAsLoneDeduction(input: {
  fileId: string;
  itemId: string;
  claimId: string;
  row: { seller: string | null; bought_on: string | null; amount_cents: number };
  reading: DeductionRead;
  stored: Json;
}): Promise<{ ok: true } | Refused | null> {
  const { data: others, error } = await selectReimbursementFiles("id")
    .eq("claim_item_id", input.itemId)
    .neq("id", input.fileId)
    .not("confirmed_at", "is", null)
    .is("replaced_at", null);
  if (error) return { ok: false, error: `Could not read the receipt's documents: ${error.message}` };
  if ((others ?? []).length > 0) return null;

  const { data: refiled, error: refileError } = await updateReimbursementFiles({ kind: "bank_deduction" })
    .eq("id", input.fileId)
    .eq("claim_item_id", input.itemId)
    .neq("kind", "bank_deduction")
    .select("id, kind");
  if (refileError) return { ok: false, error: `Could not file the bank deduction: ${refileError.message}` };
  // Audited as it lands, so a row update that fails after it still leaves the refile on record.
  if ((refiled ?? []).length > 0) {
    await recordAudit({
      table: "reimbursement_files",
      recordId: input.fileId,
      operation: "update",
      actor: null,
      newData: { kind: "bank_deduction" },
      context: { claimId: input.claimId, itemId: input.itemId, move: "file_as_bank_deduction" },
    });
  }

  const amount = input.row.amount_cents > 0 ? input.row.amount_cents : Number(input.reading.amount_minor);
  const { data: saved, error: saveError } = await updateReimbursementClaimItems({
    seller: input.row.seller ?? input.reading.seller?.trim() ?? null,
    bought_on: input.row.bought_on ?? input.reading.bought_on,
    amount_cents: amount,
    currency: "vnd",
    ...itemValue({ amount, currency: "vnd", chargedVnd: null, rate: null }),
    ai_reading: input.stored,
    // A bank's record names no buyer and duplicates no receipt: the warnings are a receipt's.
    ai_flags: [],
    duplicate_of_item_id: null,
  })
    .eq("id", input.itemId)
    .eq("claim_id", input.claimId)
    .select("id");
  if (saveError || (saved ?? []).length === 0) {
    const why = saveError ? receiptWriteError(saveError, saveError.message) : "the row is no longer on the claim";
    return { ok: false, error: `The file is now filed as a bank deduction, but its row was not valued at it (${why}). Edit the row and enter what the bank took.` };
  }
  return { ok: true };
}

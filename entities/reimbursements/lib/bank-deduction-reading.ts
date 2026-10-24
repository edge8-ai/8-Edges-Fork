// The bank deduction's reading (RB.20). A purchase abroad on a Vietnamese
// account or card is paid back at what the bank actually took in dong, not at
// the receipt's amount converted at a rate. The owner proves that figure with
// a screenshot from their banking app or a line of their card statement, filed
// as a bank deduction beside the original receipt; the AI reads it for its dong
// amount and fills "Amount deducted from your bank or card" when the owner has
// not typed one. That amount is the receipt's value (itemValue: what the bank
// took always wins over a rate), and the original stays as its reference.
//
// The deduction is never compared with the receipt and never touches the
// receipt's own reading or warnings: the two figures are in different
// currencies, so comparing them would only ever say "Amount differs".
//
// Class S, on the same reader as the receipt's (receipt-reading.ts). Not
// exported through the entity's door: the owner's confirm is its one caller,
// after its guard.
import { itemValue, ownerCan } from "./claim-rules";
import { claimRowFrom, CLAIM_ROW_COLUMNS } from "./own-claims";
import { receiptWriteError } from "./receipt-freeze";
import { readStoredDocument, type ReceiptReadingType } from "./receipt-reading";
import { selectReimbursementFiles } from "./reads";
import { updateReimbursementClaimItems } from "./writes";

type Refused = { ok: false; error: string };
export type DeductionOutcome = { ok: true; deductedVnd: number | null; filled: boolean } | Refused;

/** The receipt a deduction sits on, as the fill decides on it. `amount_cents` is in the receipt's currency's minor units. */
type DeductedItem = { currency: string; amount_cents: number; charged_vnd: number | null };

/**
 * The dong amount a reading fills in, or null when it fills nothing. Only on a
 * receipt in another currency whose own amount is known (the value's implied
 * rate is worked out against it), only while the owner may change the claim,
 * never over an amount they typed, and only a figure the reader says is in
 * dong. Pure.
 */
export function deductionToFill(reading: ReceiptReadingType | null, item: DeductedItem, editable: boolean): number | null {
  if (!editable || !reading || item.currency.toLowerCase() === "vnd" || item.charged_vnd !== null || !(item.amount_cents > 0)) return null;
  if ((reading.currency ?? "").toLowerCase() !== "vnd" || reading.amount_minor === null || !(reading.amount_minor > 0)) return null;
  return reading.amount_minor;
}

const FILE_COLUMNS = `id, kind, storage_path, mime_type, claim_item_id, reimbursement_claim_items!inner(id, amount_cents, currency, charged_vnd, reimbursement_claims!inner(${CLAIM_ROW_COLUMNS}))`;

/**
 * Reads one confirmed bank deduction and, when `deductionToFill` says so,
 * values its receipt at the amount read. The write is guarded on the deducted
 * amount still being empty, so an amount the owner saved in the meantime wins.
 * A failure writes nothing: the owner can always type the amount.
 */
export async function readBankDeduction(fileId: string): Promise<DeductionOutcome> {
  const { data: file, error } = await selectReimbursementFiles(FILE_COLUMNS).eq("id", fileId).eq("kind", "bank_deduction").not("confirmed_at", "is", null).maybeSingle();
  if (error) return { ok: false, error: `Could not read the file: ${error.message}` };
  if (!file) return { ok: false, error: "File not found." };
  const row = file.reimbursement_claim_items as Record<string, unknown>;
  const claim = claimRowFrom(row.reimbursement_claims as Record<string, unknown>);
  const item: DeductedItem = {
    currency: String(row.currency),
    amount_cents: Number(row.amount_cents),
    charged_vnd: row.charged_vnd === null || row.charged_vnd === undefined ? null : Number(row.charged_vnd),
  };

  const read = await readStoredDocument({ id: fileId, storagePath: String(file.storage_path), mimeType: String(file.mime_type ?? "") });
  if (!read.ok) return { ok: false, error: "The bank deduction could not be read just now. Type the amount instead." };
  const reading = read.reading;
  const deductedVnd = reading && (reading.currency ?? "").toLowerCase() === "vnd" ? reading.amount_minor : null;

  const fill = deductionToFill(reading, item, ownerCan(claim).edit);
  if (fill === null) return { ok: true, deductedVnd, filled: false };
  const value = itemValue({ amount: item.amount_cents, currency: item.currency, chargedVnd: fill, rate: null });
  const { data: saved, error: saveError } = await updateReimbursementClaimItems(value).eq("id", String(row.id)).is("charged_vnd", null).select("id");
  if (saveError) return { ok: false, error: receiptWriteError(saveError, `Could not save the deducted amount: ${saveError.message}`) };
  return { ok: true, deductedVnd, filled: (saved ?? []).length > 0 };
}

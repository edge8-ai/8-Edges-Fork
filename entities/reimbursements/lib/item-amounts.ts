// The amounts of a receipt, the one thing its owner types once its files are
// read (RB.26, Khoa 2026-11-06: "the only thing they can change is the
// numbers"). Seller, date and category come from the files; the owner
// corrects the amount on the receipt, in its currency, and what was paid to
// them in dong. A receipt carrying its bank deduction is paid what the bank
// took, always (RB.20), so that figure is required there; a receipt abroad
// without one is paid at the bank's selling rate on its date unless the owner
// types what the bank took; a dong receipt is its own amount. A lone bank
// deduction is a dong amount and nothing else.
//
// A receipt typed by hand with no file (a lost receipt) keeps the full form
// (claim-items.ts updateClaimItem): it has nothing to read its other fields from.
// Not a "use server" file: the owner's action calls it after its guard.
import { z } from "zod";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import type { Result } from "@/kernel/data/result";
import { refileAbroadInvoices } from "./claim-files";
import { itemValueWithRate, REMOVED_STAYS } from "./claim-items";
import { boughtInVietnamByDefault } from "./claim-rules";
import { isClaimCurrency } from "./currencies";
import { hasJoinedDeduction, isLoneDeduction } from "./join-rules";
import { openForOwner } from "./own-claims";
import { receiptWriteError } from "./receipt-freeze";
import { selectReimbursementClaimItems, selectReimbursementFiles } from "./reads";
import { updateReimbursementClaimItems } from "./writes";

/** The amounts as the Edit form sends them. `amount` is in the currency's minor units; `paidVnd` is whole dong, or none. */
export const ItemAmountsInput = z.object({
  amount: z.number({ message: "Enter the amount." }).int("Enter the amount in the currency's smallest unit.").positive("Enter the amount."),
  currency: z
    .string()
    .transform((v) => v.toLowerCase())
    .refine(isClaimCurrency, "Pick a currency."),
  paidVnd: z.number().int("Enter whole dong, with no decimals.").positive("Enter what the bank took.").nullish().transform((v) => v ?? null),
});
export type ItemAmountsInputType = z.input<typeof ItemAmountsInput>;

/** Saves a receipt's amounts on one of the owner's claims while it may still be changed. */
export async function updateItemAmounts(input: { itemId: string; personId: string; amounts: ItemAmountsInputType }): Promise<Result> {
  const parsed = ItemAmountsInput.safeParse(input.amounts);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const opened = await openForOwner({ itemId: input.itemId }, input.personId, "edit");
  if (!opened.ok) return opened;
  if (opened.value.removed) return { ok: false, error: REMOVED_STAYS };
  const claimId = opened.value.claim.id;

  const { data: row, error } = await selectReimbursementClaimItems("currency, bought_on").eq("id", input.itemId).eq("claim_id", claimId).maybeSingle();
  if (error) return { ok: false, error: `Could not read the receipt: ${error.message}` };
  if (!row) return { ok: false, error: "That receipt is no longer on the claim." };
  const { data: files, error: filesError } = await selectReimbursementFiles("kind, replaced_at").eq("claim_item_id", input.itemId).not("confirmed_at", "is", null);
  if (filesError) return { ok: false, error: `Could not read the receipt's documents: ${filesError.message}` };
  const documents = (files ?? []).map((f) => ({ kind: String(f.kind), replacedAt: (f.replaced_at as string | null) ?? null }));

  const { amount, currency, paidVnd } = parsed.data;
  if (isLoneDeduction(documents) && currency !== "vnd") return { ok: false, error: "A bank deduction is in dong: enter what the bank took." };
  const joined = hasJoinedDeduction(documents);
  if (joined && currency === "vnd") return { ok: false, error: "This receipt carries a bank deduction, so its amount is in the currency it was paid in." };
  if (joined && paidVnd === null) return { ok: false, error: "Your bank deduction is what you are paid: enter the dong it shows." };

  const chargedVnd = currency === "vnd" ? null : paidVnd;
  const value = await itemValueWithRate({ amount, currency, chargedVnd, boughtOn: (row.bought_on as string | null) ?? null }, input.personId);
  // A change of currency moves the receipt home or abroad, as a new receipt starts (claim-rules boughtInVietnamByDefault).
  const moved = currency !== String(row.currency);
  const patch = { amount_cents: amount, currency, ...value, ...(moved ? { bought_in_vietnam: boughtInVietnamByDefault(currency) } : {}) };
  const { data: saved, error: saveError } = await updateReimbursementClaimItems(patch).eq("id", input.itemId).eq("claim_id", claimId).select("id");
  if (saveError) return { ok: false, error: receiptWriteError(saveError, `Could not save the amounts: ${saveError.message}`) };
  if ((saved ?? []).length === 0) return { ok: false, error: "That receipt is no longer on the claim." };
  if (moved && !boughtInVietnamByDefault(currency)) return refileAbroadInvoices({ itemId: input.itemId, claimId, personId: input.personId });
  return { ok: true };
}

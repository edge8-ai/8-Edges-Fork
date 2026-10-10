// Claim items: one receipt each, added one at a time while the claim is the
// owner's to change (draft, or sent back). An item keeps its original amount,
// in the currency's minor units, and its currency, and is valued in VND
// (RB.10, plan section 10): a dong receipt at itself; any other at what the
// person's card actually charged when they enter it, which always wins, or
// else at the bank's selling rate on the day it was bought (vnd-rates.ts).
// With neither, the item is saved anyway with no value, "rate pending": the
// daily rate cron asks the banks again, and a checker can enter the rate by
// hand (`enterItemRateByHand`). The item keeps the rate it was valued at.
//
// The lock is an app rule, not a trigger (design §1.2): the owner may change
// items only while `ownerCan(claim).edit`, and the database adds the one part
// that must hold whoever writes — an item of a claim that was ever submitted
// cannot be deleted (plan §10, 20261008090000). There the owner marks it
// removed, with a reason, and it stays on the claim, out of every total;
// only from a draft never submitted is it deleted (item-removal.ts).
import { z } from "zod";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import { formatDate } from "@/kernel/ui/format";
import type { Result } from "@/kernel/data/result";
import { CLAIM_CATEGORIES } from "./categories";
import { recordAudit } from "@/kernel/audit/audit";
import { isClaimCurrency } from "./currencies";
import { boughtInVietnamByDefault, checkRefusal, itemValue, type ItemValueColumns, type SubmitItem } from "./claim-rules";
import { ownClaimRefusal, waitsOn } from "./claim-moves";
import { receiptWriteError } from "./receipt-freeze";
import { stillCounted } from "./retention-rules";
import type { ClaimActor } from "./claim-lifecycle";
import type { ClaimRow } from "./own-claims";
import { rateFor, fxRateTable } from "./vnd-rates";
import { lockedBecause, refileAbroadInvoices, startReceiptUpload, type DocumentKind } from "./claim-files";
import { takeOffBlankItem } from "./item-removal";
import { readClaimRow, readOwnItem } from "./own-claims";
import { selectReimbursementClaimItems, selectReimbursementFiles } from "./reads";
import { insertReimbursementClaimItems, updateReimbursementClaimItems } from "./writes";

const blankToNull = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One item as the owner's form sends it. `amount` is in the currency's minor units (whole dong for VND, cents for a dollar). */
export const ClaimItemInput = z
  .object({
    description: z.string().max(500, "Keep what it was under 500 characters.").nullish().transform(blankToNull),
    seller: z.string().max(200, "Keep the seller under 200 characters.").nullish().transform(blankToNull),
    boughtOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date it was bought.")
      .nullish()
      .or(z.literal(""))
      .transform((v) => v || null),
    category: z.enum(CLAIM_CATEGORIES, { message: "Pick a category." }),
    amount: z.number({ message: "Enter the amount." }).int("Enter the amount in the currency's smallest unit.").positive("Enter the amount."),
    currency: z
      .string()
      .transform((v) => v.toLowerCase())
      .refine(isClaimCurrency, "Pick a currency."),
    // What the card actually charged in VND, for a receipt in another currency.
    chargedVnd: z.number().int("Enter whole dong, with no decimals.").positive("Enter what the card charged.").nullish().transform((v) => v ?? null),
    boughtInVietnam: z.boolean(),
    lostReceiptNote: z.string().max(1000, "Keep the explanation under 1,000 characters.").nullish().transform(blankToNull),
    // The rebill tag (RB.11): a client is to be billed for this receipt. A tag
    // for the export, nothing more; it changes no amount and no rule.
    rebill: z.boolean().optional().default(false),
    rebillCompanyId: z.string().nullish().transform(blankToNull),
  })
  .superRefine((v, ctx) => {
    if (v.category === "other" && !v.description) ctx.addIssue({ code: "custom", path: ["description"], message: "Say what it was: Other needs an explanation." });
    if (v.lostReceiptNote && v.boughtInVietnam) {
      ctx.addIssue({ code: "custom", path: ["lostReceiptNote"], message: "A lost receipt can be explained only for something bought abroad." });
    }
    if (v.rebill && !v.rebillCompanyId) ctx.addIssue({ code: "custom", path: ["rebillCompanyId"], message: "Pick the client to rebill." });
    else if (v.rebill && !UUID.test(v.rebillCompanyId ?? "")) ctx.addIssue({ code: "custom", path: ["rebillCompanyId"], message: "That client was not found." });
  })
  // An untagged receipt names no company, so a client picked and then unticked
  // never rides along into the export.
  .transform((v) => (v.rebill ? v : { ...v, rebillCompanyId: null }));
export type ClaimItemInputType = z.input<typeof ClaimItemInput>;

/**
 * The VND value of an item as the form describes it. A dong receipt and a card
 * charge need no rate, so no bank is asked; a receipt abroad with no date has
 * no day to look a rate up on, and stays rate pending until it has one.
 */
async function valueOf(v: z.output<typeof ClaimItemInput>, owner: string): Promise<ItemValueColumns> {
  const needsRate = v.currency !== "vnd" && v.chargedVnd === null && v.boughtOn !== null;
  const rate = needsRate ? await rateFor(v.currency, v.boughtOn as string, { owner }) : null;
  return itemValue({ amount: v.amount, currency: v.currency, chargedVnd: v.chargedVnd, rate });
}

/** The columns of an item, as its row is stored. `owner` is whose receipt it is, for the rate lookup. */
async function itemColumns(v: z.output<typeof ClaimItemInput>, owner: string) {
  return {
    description: v.description,
    seller: v.seller,
    bought_on: v.boughtOn,
    category: v.category,
    amount_cents: v.amount,
    currency: v.currency,
    ...(await valueOf(v, owner)),
    bought_in_vietnam: v.boughtInVietnam,
    lost_receipt_note: v.lostReceiptNote,
    rebill: v.rebill,
    rebill_company_id: v.rebillCompanyId,
  };
}

/** How an item is named in a list or a refusal: "Grab · Oct 2, 2026". */
export function itemLabel(r: { seller?: unknown; description?: unknown; bought_on?: unknown }): string {
  const name = (typeof r.seller === "string" && r.seller) || (typeof r.description === "string" && r.description) || "Receipt";
  return typeof r.bought_on === "string" && r.bought_on ? `${name} · ${formatDate(r.bought_on)}` : name;
}

/** Adds an item to the end of one of the owner's claims. */
export async function addClaimItem(input: { claimId: string; personId: string; item: ClaimItemInputType }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = ClaimItemInput.safeParse(input.item);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const added = await appendItem(input.claimId, input.personId, () => itemColumns(parsed.data, input.personId));
  return added.ok ? { ok: true, id: added.id } : added;
}

type ItemColumns = Awaited<ReturnType<typeof itemColumns>>;

/**
 * Appends a row of item columns to one of the owner's claims while they may
 * still change it. The columns are worked out only once the claim is known to
 * be open, because valuing a receipt abroad may ask a bank for its rate.
 */
async function appendItem(
  claimId: string,
  personId: string,
  columnsOf: () => Promise<ItemColumns> | ItemColumns,
): Promise<{ ok: true; id: string; claim: ClaimRow } | { ok: false; error: string }> {
  const claim = await readClaimRow(claimId, { ownedBy: personId });
  if (!claim.ok) return claim;
  const locked = lockedBecause(claim.value);
  if (locked) return { ok: false, error: locked };

  const { data: last, error: lastError } = await selectReimbursementClaimItems("position")
    .eq("claim_id", claimId)
    .order("position", { ascending: false })
    .limit(1);
  if (lastError) return { ok: false, error: `Could not add the receipt: ${lastError.message}` };
  const position = last && last.length > 0 ? Number(last[0].position) + 1 : 0;
  const { data, error } = await insertReimbursementClaimItems({ claim_id: claimId, position, ...(await columnsOf()) }).select("id").single();
  if (error) return { ok: false, error: receiptWriteError(error, `Could not add the receipt: ${error.message}`) };
  if (!data) return { ok: false, error: "Could not add the receipt: no row" };
  return { ok: true, id: data.id, claim: claim.value };
}

/**
 * The item a dropped file starts (RB.9): nothing filled in but the file's
 * name. Category Other described by that name is how "no category chosen
 * yet" is stored, because Other needs words, and an amount of 0 is "no amount
 * yet", which submit refuses (claim-rules); the AI reading fills both in
 * where the person has not (receipt-reading.ts `prefillFor`). In dong and
 * bought in Vietnam, as a new receipt starts on the form.
 */
function droppedItemColumns(filename: string): ItemColumns {
  return {
    description: filename,
    seller: null,
    bought_on: null,
    category: "other",
    amount_cents: 0,
    currency: "vnd",
    // A dong receipt is valued at itself: 0 until the reading or the person fills it in.
    ...itemValue({ amount: 0, currency: "vnd", chargedVnd: null, rate: null }),
    bought_in_vietnam: boughtInVietnamByDefault("vnd"),
    lost_receipt_note: null,
    // Not tagged for rebilling until the person says so (RB.11).
    rebill: false,
    rebill_company_id: null,
  };
}

/** What a dropped file is filed as: a PDF is the red invoice a Vietnamese item needs, a photo is a receipt. */
const droppedKind = (type: string): DocumentKind => (type === "application/pdf" ? "red_invoice" : "receipt");

/**
 * Many receipts at once (RB.9): one dropped or photographed file becomes one
 * new item, and its upload starts. The browser uploads, then confirms through
 * the same confirm every document uses. A refused start takes the blank item
 * off the claim again (`takeOffBlankItem`).
 */
export async function startDroppedReceipt(input: {
  claimId: string;
  personId: string;
  declared: { name: string; size: number; type: string };
}): Promise<{ ok: true; itemId: string; fileId: string; bucket: string; path: string; token: string } | { ok: false; error: string }> {
  // The file row keeps the same 200 characters, so the reading can tell the file's name from the person's words.
  const added = await appendItem(input.claimId, input.personId, () => droppedItemColumns(input.declared.name.slice(0, 200)));
  if (!added.ok) return added;
  const started = await startReceiptUpload({ itemId: added.id, kind: droppedKind(input.declared.type), personId: input.personId, declared: input.declared });
  if (started.ok) return { ...started, itemId: added.id };
  await takeOffBlankItem(added.id, added.claim, input.personId);
  return started;
}

/** What the owner hears on an edit of a receipt they removed. */
const REMOVED_STAYS = "This receipt was removed from the claim, so it stays as it was.";

/** Changes an item on one of the owner's claims while it may still be changed. */
export async function updateClaimItem(input: { itemId: string; personId: string; item: ClaimItemInputType }): Promise<Result> {
  const parsed = ClaimItemInput.safeParse(input.item);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const item = await readOwnItem(input.itemId, input.personId);
  if (!item.ok) return item;
  const locked = lockedBecause(item.value.claim);
  if (locked) return { ok: false, error: locked };
  if (item.value.removed) return { ok: false, error: REMOVED_STAYS };
  const { data, error } = await updateReimbursementClaimItems(await itemColumns(parsed.data, input.personId)).eq("id", input.itemId).eq("claim_id", item.value.claim.id).select("id");
  if (error) return { ok: false, error: receiptWriteError(error, `Could not save the receipt: ${error.message}`) };
  if ((data ?? []).length === 0) return { ok: false, error: "That receipt is no longer on the claim." };
  if (!parsed.data.boughtInVietnam) return refileAbroadInvoices({ itemId: input.itemId, claimId: item.value.claim.id, personId: input.personId });
  return { ok: true };
}

/**
 * A claim's items as the submit rule sees them, with their confirmed and
 * unconfirmed documents, each item's removal and each document's replacement
 * (the rule asks nothing of the one and accepts nothing from the other). A
 * failed read is an answer the caller must not act on, so it comes back as an
 * error rather than as "no items".
 */
export async function loadSubmitItems(claimId: string): Promise<{ ok: true; items: SubmitItem[] } | { ok: false; error: string }> {
  const { data: rows, error } = await selectReimbursementClaimItems("id, seller, description, bought_on, category, currency, amount_cents, bought_in_vietnam, lost_receipt_note, removed_at")
    .eq("claim_id", claimId)
    .order("position");
  if (error) return { ok: false, error: `Could not read the claim's receipts: ${error.message}` };
  const items = rows ?? [];
  if (items.length === 0) return { ok: true, items: [] };
  const { data: files, error: filesError } = await selectReimbursementFiles("claim_item_id, kind, mime_type, confirmed_at, replaced_at").in(
    "claim_item_id",
    items.map((i) => String(i.id)),
  );
  if (filesError) return { ok: false, error: `Could not read the claim's documents: ${filesError.message}` };
  return {
    ok: true,
    items: items.map((i) => ({
      label: itemLabel(i),
      category: String(i.category),
      currency: String(i.currency),
      amount: Number(i.amount_cents),
      boughtInVietnam: i.bought_in_vietnam === true,
      lostReceiptNote: (i.lost_receipt_note as string | null) ?? null,
      removed: i.removed_at !== null && i.removed_at !== undefined,
      documents: (files ?? [])
        .filter((f) => f.claim_item_id === i.id && f.kind !== "bank_receipt")
        .map((f) => ({
          kind: f.kind as "receipt" | "red_invoice",
          confirmed: f.confirmed_at !== null && f.confirmed_at !== undefined,
          mimeType: (f.mime_type as string | null) ?? null,
          replaced: f.replaced_at !== null && f.replaced_at !== undefined,
        })),
    })),
  };
}

/**
 * Why the claim cannot be checked yet, read before the check writes (RB.10):
 * a receipt the check keeps whose rate is pending has no VND value to pass
 * on. A failed read refuses the check rather than passing an unknown total.
 * A receipt its owner removed passes nothing on, so it is left out.
 */
export async function checkBlockedBy(claimId: string): Promise<string | null> {
  const { data, error } = await selectReimbursementClaimItems("id, seller, description, bought_on, amount_vnd, declined_at, removed_at").eq("claim_id", claimId);
  if (error) return `Could not read the claim's receipts: ${error.message}`;
  return checkRefusal(
    stillCounted(data ?? []).map((i) => ({
      label: itemLabel(i),
      amountVnd: i.amount_vnd === null || i.amount_vnd === undefined ? null : Number(i.amount_vnd),
      declined: Boolean(i.declined_at),
    })),
  );
}

/**
 * A rate as a checker types it: VND per one unit, positive, at most six
 * decimals (the precision vndAt scales to), commas allowed as separators.
 */
const ManualRate = z
  .string()
  .transform((v) => v.replace(/[\s,]/g, ""))
  .refine((v) => /^\d+(\.\d{1,6})?$/.test(v) && Number(v) > 0 && Number(v) < 1e9, "Enter the rate as VND per one unit, such as 18,426.")
  .transform(Number);


/**
 * A checker enters the rate of one receipt by hand (design §1.10): the floor
 * that works when no bank answers, or when the bank's rate is not the one the
 * books will use. It is the checker's step, so the checker's rules hold:
 * never on their own claim, only while the claim waits to be checked. The
 * item is valued at it and stamped `manual`; the rate is kept in
 * reimbursement_fx_rates with who entered it, for the day the receipt was
 * bought, so another receipt that day and currency finds it when no bank does.
 * A card charge wins over any rate, so a receipt valued by its card is
 * refused, and the write itself is guarded on `charged_vnd` being empty.
 */
export async function enterItemRateByHand(input: { row: ClaimRow; itemId: string; actor: ClaimActor; rate: string }): Promise<Result> {
  const { row, actor } = input;
  if (actor.kind !== "checker") return { ok: false, error: "Only a checker can enter a rate." };
  const refusal = ownClaimRefusal(row, actor);
  if (refusal) return { ok: false, error: refusal };
  if (!waitsOn(row.status, "checker")) return { ok: false, error: "A rate can be entered only while the claim waits to be checked." };
  const rate = ManualRate.safeParse(input.rate);
  if (!rate.success) return { ok: false, error: zodIssuesToMessage(rate.error.issues) };

  const { data: item, error } = await selectReimbursementClaimItems("id, currency, amount_cents, bought_on, charged_vnd, removed_at")
    .eq("id", input.itemId)
    .eq("claim_id", row.id)
    .maybeSingle();
  if (error) return { ok: false, error: `Could not read the receipt: ${error.message}` };
  if (!item) return { ok: false, error: "That receipt is no longer on the claim." };
  if (item.removed_at) return { ok: false, error: "Its owner removed this receipt, so it needs no rate." };
  const currency = String(item.currency);
  if (currency === "vnd") return { ok: false, error: "A dong receipt needs no rate." };
  if (item.charged_vnd !== null && item.charged_vnd !== undefined) {
    return { ok: false, error: "This receipt is valued at what the card charged, which wins over any rate." };
  }

  const boughtOn = (item.bought_on as string | null) ?? null;
  if (boughtOn) {
    try {
      await fxRateTable.save({ currency, rateDate: boughtOn, source: "manual", rate: rate.data, enteredBy: actor.personId });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  const value = itemValue({ amount: Number(item.amount_cents), currency, chargedVnd: null, rate: { rate: rate.data, source: "manual", asOf: boughtOn ?? "" } });
  const patch = { amount_vnd: value.amount_vnd, fx_rate: value.fx_rate, fx_source: value.fx_source, fx_as_of: boughtOn };
  const { data: landed, error: writeError } = await updateReimbursementClaimItems(patch)
    .eq("id", input.itemId)
    .eq("claim_id", row.id)
    .is("charged_vnd", null)
    .select("id");
  if (writeError) return { ok: false, error: receiptWriteError(writeError, `Could not save the rate: ${writeError.message}`) };
  if ((landed ?? []).length === 0) return { ok: false, error: "That receipt changed while you were working on it. Reload and try again." };
  await recordAudit({
    table: "reimbursement_claim_items",
    recordId: input.itemId,
    operation: "update",
    actor: actor.label ?? null,
    newData: patch,
    context: { claimId: row.id, move: "enter_rate" },
  });
  return { ok: true };
}

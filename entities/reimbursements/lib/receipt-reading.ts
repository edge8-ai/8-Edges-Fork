// The AI receipt reading (design §1.9): one model read of one stored receipt
// or red invoice, kept on its item as `ai_reading`. It is a suggestion, never a
// decision. What it suggests fills in only the fields the person left empty,
// and only while the claim is still theirs to change; what it notices about
// the document (a red invoice made out to someone else, a document it could
// not read, a receipt already claimed) is a flag the checker sees beside the
// document. A flag warns and never blocks submit: canSubmit reads none of it,
// and the red-invoice hard block (RB.2) is the presence of the PDF alone.
//
// Class S: a receipt is money, can carry a person's name and tax code, and a
// wrongly issued invoice carries the employee's own details, so the read runs
// on api.anthropic.com only and never on Fable (Y.73). The `fast` tier because
// this runs once per upload, the path the cost policy keeps off Opus.
//
// Not exported through the entity's door (design §2.2): the owner's confirm
// and the checker's re-read are its only callers, both after their guard.
import { receiptWriteError } from "./receipt-freeze";
import { valueAbroad } from "./receipt-value";
import { extractText, getDocumentProxy } from "unpdf";
import { z } from "zod/v4";
import type Anthropic from "@anthropic-ai/sdk";
import { aiSite } from "@/kernel/ai/gateway";
import { fillPrompt } from "@/kernel/ai/prompts";
import type { AiDataClass } from "@/kernel/ai/routing";
import { jsonSchemaFor, readStructuredOutput } from "@/kernel/ai/response";
import { supabase } from "@/kernel/data/supabase";
import type { Json } from "@/kernel/data/supabase/database.types";
import { CLAIM_CATEGORIES } from "./categories";
import type { DocumentKind, ReceiptFlag } from "./claim-labels";
import { documentOptional } from "./categories";
import { boughtInVietnamByDefault, ownerCan } from "./claim-rules";
import { isClaimCurrency } from "./currencies";
import { RECEIPTS_BUCKET, refileAbroadInvoices } from "./claim-files";
import { claimRowFrom, CLAIM_ROW_COLUMNS } from "./own-claims";
import { readRedInvoiceBuyer, type RedInvoiceBuyer } from "./red-invoice-buyer";
import { selectReimbursementClaimItems, selectReimbursementFiles } from "./reads";
import { updateReimbursementClaimItems } from "./writes";
import { RECEIPT_READ_PROMPT } from "./receipt-reading.prompt";

export const RECEIPT_READ_CLASS: AiDataClass = "S";
const AI = aiSite({ site: "receipt-read", dataClass: RECEIPT_READ_CLASS, tier: "fast" });

/** The model's answer, exactly as design §1.9 specifies it. */
export const ReceiptReading = z.object({
  // No `.nonnegative()`: the structured-output API refuses a numeric bound (kernel/ai/response.ts),
  // so the range is in the description and `prefillFor` takes only an amount above 0.
  amount_minor: z.number().int().nullable().describe("The total paid, never negative, in the currency's minor unit: whole dong for VND, cents otherwise. null if unreadable."),
  currency: z.string().length(3).nullable().describe("ISO 4217 code of the total, e.g. VND, USD. null if unclear."),
  bought_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().describe("The date of purchase as YYYY-MM-DD. null if absent."),
  seller: z.string().max(200).nullable().describe("The seller's trading name as printed. null if absent."),
  category: z.enum(CLAIM_CATEGORIES).nullable().describe("The closest expense category. null if unsure."),
  is_red_invoice: z.boolean().describe("True only for a Vietnamese VAT e-invoice (hoá đơn GTGT / hoá đơn điện tử)."),
  buyer_name: z.string().max(200).nullable().describe("The buyer's name on a red invoice (Tên đơn vị / Họ tên người mua), copied exactly. null if none."),
  buyer_tax_code: z.string().max(32).nullable().describe("The buyer's tax code (Mã số thuế người mua), copied exactly. null if none."),
  confidence: z.enum(["high", "medium", "low"]).describe("How sure you are of the amount, date and seller together."),
  notes: z.string().max(500).nullable().describe("Anything a finance checker should know, in one or two sentences. null if nothing."),
});
export type ReceiptReadingType = z.infer<typeof ReceiptReading>;

/** What is stored as `ai_reading`: the model's answer and the file it read. */
export type StoredReading = ReceiptReadingType & { file_id: string; read_at: string };

const StoredReadingSchema = ReceiptReading.extend({ file_id: z.string(), read_at: z.string() });

/** A stored reading as a page shows it, or null when there is none or it is not one. */
export function storedReadingOf(value: unknown): StoredReading | null {
  const parsed = StoredReadingSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const READ_SCHEMA = jsonSchemaFor(ReceiptReading);

// The flags this module raises are five of claim-labels' ReceiptFlag.
// `older_than_90_days` is in that vocabulary too, but it is a rule about the
// date, not the reading, and nothing here sets it.

export type DuplicateFacts = {
  /** The hash of the file read. */
  sha256: string | null;
  /** The item read, as it stands once pre-filled. */
  item: ComparableItem;
  /** The person's confirmed files with the same hash. */
  files: { itemId: string; sha256: string | null }[];
  /** The person's items with the same date and amount. */
  items: ComparableItem[];
};
type ComparableItem = { id: string; seller: string | null; boughtOn: string | null; amount: number };

const digits = (v: string | null) => (v ?? "").replace(/\D/g, "");
/** A name as two spellings of it compare: no accents, no case, no punctuation. */
const nameKey = (v: string | null) =>
  (v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

function buyerFlags(reading: ReceiptReadingType, buyer: RedInvoiceBuyer): ReceiptFlag[] {
  // A document that is not a red invoice names no buyer to check. When it was
  // filed as one, flagsFor says so instead.
  if (!reading.is_red_invoice) return [];
  // No buyer configured, or it could not be read: there is nothing to compare
  // with, and the claim pages already say which.
  if (buyer.state !== "ready" && buyer.state !== "no_tax_code") return [];
  const flags: ReceiptFlag[] = [];
  const name = nameKey(reading.buyer_name);
  if (!name || !name.includes(nameKey(buyer.legalName))) flags.push("buyer_not_organisation");
  // Until a Super Admin enters the tax code (§5) only the name is checked.
  if (buyer.state === "ready" && digits(reading.buyer_tax_code) !== digits(buyer.taxCode)) flags.push("buyer_tax_code_differs");
  return flags;
}

function unreadable(reading: ReceiptReadingType | null): boolean {
  if (!reading) return true;
  return reading.confidence === "low" || (reading.amount_minor === null && reading.bought_on === null && reading.seller === null);
}

function duplicateOf(facts: DuplicateFacts): string | null {
  if (facts.sha256) {
    const same = facts.files.find((f) => f.itemId !== facts.item.id && f.sha256 === facts.sha256);
    if (same) return same.itemId;
  }
  const { seller, boughtOn, amount } = facts.item;
  if (!nameKey(seller) || !boughtOn || !(amount > 0)) return null;
  const twin = facts.items.find((i) => i.id !== facts.item.id && nameKey(i.seller) === nameKey(seller) && i.boughtOn === boughtOn && i.amount === amount);
  return twin?.id ?? null;
}

/**
 * The warnings a reading raises, and the receipt it may duplicate. Pure. A
 * red invoice must name the organisation (its legal name, and its tax code
 * once one is configured); a document filed as a red invoice must be one; a
 * document with nothing legible is unreadable; the same file or the same
 * seller, date and amount on another of the person's receipts is a possible
 * duplicate.
 *
 * `filedAs` is the kind the file was uploaded as. A dropped PDF is filed as a
 * red invoice by default, so a Grab receipt or a shop's slip saved as a PDF
 * reaches here as one; without this flag the checker would see a clean item
 * on a Vietnamese purchase that has no red invoice. An unreadable document is
 * not called "not a red invoice": the reader cannot tell what it is, and the
 * unreadable flag already asks the checker to look.
 */
export function flagsFor(reading: ReceiptReadingType | null, filedAs: DocumentKind, buyer: RedInvoiceBuyer, facts: DuplicateFacts): { flags: ReceiptFlag[]; duplicateOfItemId: string | null } {
  const flags: ReceiptFlag[] = reading ? buyerFlags(reading, buyer) : [];
  if (unreadable(reading)) flags.push("unreadable");
  else if (filedAs === "red_invoice" && reading && !reading.is_red_invoice) flags.push("not_a_red_invoice");
  const duplicateOfItemId = duplicateOf(facts);
  if (duplicateOfItemId) flags.push("possible_duplicate");
  return { flags, duplicateOfItemId };
}

/** An item's editable columns, as stored. */
export type ItemFields = { seller: string | null; bought_on: string | null; amount_cents: number; currency: string; category: string; description: string | null };

/** What a reading may fill in: the person's fields, where it starts abroad, and a dong receipt's value. */
export type Prefill = Partial<ItemFields & { amount_vnd: number; bought_in_vietnam: boolean }>;

/**
 * The columns a reading fills in: only those the person left empty. A receipt
 * added by dropping its file starts with no seller, no date, an amount of 0
 * (which submit refuses, so the person must have typed any other) and the
 * category Other described by the file's own name, because Other needs words
 * (the database says so). That pair is how "no category chosen yet" is
 * stored, so it alone is replaced, and the file name goes with it. The amount
 * is filled in the currency it was paid in (RB.10): a dropped receipt starts
 * in dong and bought in Vietnam only because the form does, so a reading in
 * another currency moves it there, and abroad. A dong amount is its own
 * value; one abroad is valued by the caller at the bank's rate. Pure.
 */
export function prefillFor(reading: ReceiptReadingType, row: ItemFields, filename: string): Prefill {
  const patch: Prefill = {};
  const seller = reading.seller?.trim();
  if (!row.seller && seller) patch.seller = seller;
  if (!row.bought_on && reading.bought_on) patch.bought_on = reading.bought_on;
  const currency = (reading.currency ?? row.currency).toLowerCase();
  if (Number(row.amount_cents) === 0 && reading.amount_minor !== null && reading.amount_minor > 0 && isClaimCurrency(currency)) {
    patch.amount_cents = reading.amount_minor;
    if (currency !== row.currency) {
      patch.currency = currency;
      patch.bought_in_vietnam = boughtInVietnamByDefault(currency);
    }
    // A dong item's value is its amount at a rate of 1 (claim-items.ts).
    if (currency === "vnd") patch.amount_vnd = reading.amount_minor;
  }
  if (row.category === "other" && row.description === filename && reading.category && reading.category !== "other") {
    patch.category = reading.category;
    patch.description = null;
  }
  return patch;
}

// What the browser shows as an image block; HEIC is accepted by the bucket but
// not by the model, so a HEIC photo is "unreadable" and the checker reads it.
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const LONG_PDF_PAGES = 20;
const LONG_PDF_READ = 5;

/** The document as the model is sent it, or null when it cannot be sent. */
async function contentBlock(bytes: Uint8Array, mimeType: string): Promise<Anthropic.ContentBlockParam | null> {
  const data = Buffer.from(bytes).toString("base64");
  if (IMAGE_TYPES.has(mimeType)) return { type: "image", source: { type: "base64", media_type: mimeType as "image/jpeg", data } };
  if (mimeType !== "application/pdf") return null;
  // A PDF over 20 pages is read for its first 5 (design §1.9): the total and
  // the buyer are on the first pages, and the rest is cost. Counting can fail
  // on a PDF pdf.js cannot open; it is then sent whole and the API decides.
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    if (pdf.numPages > LONG_PDF_PAGES) {
      const { text } = await extractText(pdf, { mergePages: false });
      const first = text.slice(0, LONG_PDF_READ).join("\n\n").trim();
      if (first) return { type: "text", text: fillPrompt(RECEIPT_READ_PROMPT.parts.longPdf, { pagesRead: LONG_PDF_READ, pageCount: pdf.numPages, text: first }) };
    }
  } catch {
    // Not countable: sent whole below.
  }
  return { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
}

type Refused = { ok: false; error: string };
export type ReadOutcome = { ok: true; reading: ReceiptReadingType | null; flags: ReceiptFlag[]; skipped?: true } | Refused;

const FILE_COLUMNS = `id, kind, storage_path, filename, mime_type, sha256, claim_item_id, reimbursement_claim_items!inner(id, seller, bought_on, amount_cents, currency, charged_vnd, bought_in_vietnam, category, description, ai_reading, reimbursement_claims!inner(${CLAIM_ROW_COLUMNS}))`;

/**
 * The person's confirmed files with this hash, and their items with this date
 * and amount. A receipt its owner removed (20261008090000) is left out, with
 * its documents: it is paid by nobody, so a new receipt cannot duplicate it,
 * and the owner's usual next step after removing one is to add it again.
 */
async function duplicateFacts(personId: string, sha256: string | null, item: ComparableItem): Promise<{ ok: true; facts: DuplicateFacts } | Refused> {
  const files: DuplicateFacts["files"] = [];
  if (sha256) {
    const { data, error } = await selectReimbursementFiles("claim_item_id, sha256, reimbursement_claim_items!inner(reimbursement_claims!inner(person_id))")
      .eq("reimbursement_claim_items.reimbursement_claims.person_id", personId)
      .eq("sha256", sha256)
      .not("confirmed_at", "is", null)
      .is("reimbursement_claim_items.removed_at", null)
      .limit(20);
    if (error) return { ok: false, error: `Could not look for duplicates: ${error.message}` };
    for (const f of data ?? []) files.push({ itemId: String(f.claim_item_id), sha256: (f.sha256 as string | null) ?? null });
  }
  const items: ComparableItem[] = [];
  if (item.boughtOn && item.amount > 0) {
    const { data, error } = await selectReimbursementClaimItems("id, seller, bought_on, amount_cents, reimbursement_claims!inner(person_id)")
      .eq("reimbursement_claims.person_id", personId)
      .eq("bought_on", item.boughtOn)
      .eq("amount_cents", item.amount)
      .neq("id", item.id)
      .is("removed_at", null)
      .limit(20);
    if (error) return { ok: false, error: `Could not look for duplicates: ${error.message}` };
    for (const i of data ?? []) items.push({ id: String(i.id), seller: (i.seller as string | null) ?? null, boughtOn: (i.bought_on as string | null) ?? null, amount: Number(i.amount_cents) });
  }
  return { ok: true, facts: { sha256, item, files, items } };
}

/**
 * Reads one confirmed receipt or red invoice and stores what it found on its
 * item: the reading, the flags, the receipt it may duplicate, and — while the
 * claim is still its owner's to change — the fields the person left empty.
 * A re-read of a submitted claim changes the reading and the flags only.
 *
 * `onlyIfUnread` is the upload's own call (design §3, RB.9: once per
 * confirmed file, when `ai_reading` is null). It reads again in one case
 * besides: a red invoice confirmed after the item's receipt was read, because
 * the buyer is checked on the invoice and the receipt's reading cannot say.
 *
 * A failure writes nothing, so the reading stays null and the next upload or
 * the checker's re-read tries again. The caller has run its guard; the file
 * id is its own or, for the checker, any claim's.
 */
export async function readReceipt(fileId: string, opts: { onlyIfUnread?: boolean } = {}): Promise<ReadOutcome> {
  const { data: file, error } = await selectReimbursementFiles(FILE_COLUMNS).eq("id", fileId).not("confirmed_at", "is", null).maybeSingle();
  if (error) return { ok: false, error: `Could not read the file: ${error.message}` };
  if (!file) return { ok: false, error: "File not found." };
  const item = file.reimbursement_claim_items as Record<string, unknown>;
  const claim = claimRowFrom(item.reimbursement_claims as Record<string, unknown>);
  const kind = String(file.kind);
  if (kind !== "receipt" && kind !== "red_invoice") return { ok: false, error: "Only receipts and red invoices are read." };

  if (opts.onlyIfUnread) {
    const stored = storedReadingOf(item.ai_reading);
    const invoiceAfterReceipt = kind === "red_invoice" && stored !== null && !stored.is_red_invoice;
    if (item.ai_reading !== null && item.ai_reading !== undefined && !invoiceAfterReceipt) return { ok: true, reading: stored, flags: [], skipped: true };
  }

  const llm = AI.clientIfConfigured();
  if (!llm) return { ok: false, error: "The receipt reader is not configured." };

  const { data: blob, error: downloadError } = await supabase.storage.from(RECEIPTS_BUCKET).download(String(file.storage_path));
  if (downloadError || !blob) return { ok: false, error: "Couldn't open the file to read it. Try again." };
  const block = await contentBlock(new Uint8Array(await blob.arrayBuffer()), String(file.mime_type ?? ""));

  let reading: ReceiptReadingType | null = null;
  if (block) {
    try {
      const response = await llm.messages.create({
        prompt: RECEIPT_READ_PROMPT,
        model: AI.model,
        max_tokens: 1000,
        system: RECEIPT_READ_PROMPT.system,
        output_config: { format: { type: "json_schema", schema: READ_SCHEMA } },
        messages: [{ role: "user", content: [block, { type: "text", text: RECEIPT_READ_PROMPT.user }] }],
      });
      const out = readStructuredOutput(AI.site, AI.model, response, ReceiptReading, "The model declined to read this document.");
      if (!out.ok) {
        console.error(`[receipt-read] ${fileId}:`, out.error);
        return { ok: false, error: "The receipt could not be read just now. Try again." };
      }
      reading = out.data;
    } catch (e) {
      console.error(`[receipt-read] ${fileId}:`, e instanceof Error ? e.message : e);
      return { ok: false, error: "The receipt could not be read just now. Try again." };
    }
  }

  const fields: ItemFields = {
    seller: (item.seller as string | null) ?? null,
    bought_on: (item.bought_on as string | null) ?? null,
    amount_cents: Number(item.amount_cents),
    currency: String(item.currency),
    category: String(item.category),
    description: (item.description as string | null) ?? null,
  };
  // The person's fields are theirs only while they may change the claim.
  const prefill = reading && ownerCan(claim).edit ? prefillFor(reading, fields, String(file.filename)) : {};
  const after = { ...fields, ...prefill };
  const valued = await valueAbroad(prefill, after, item.charged_vnd === null || item.charged_vnd === undefined ? null : Number(item.charged_vnd), claim.personId);

  const buyer = await readRedInvoiceBuyer();
  const facts = await duplicateFacts(claim.personId, (file.sha256 as string | null) ?? null, {
    id: String(item.id),
    seller: after.seller,
    boughtOn: after.bought_on,
    amount: Number(after.amount_cents),
  });
  if (!facts.ok) return facts;
  // A red invoice exists only in Vietnam. On an item that is abroad once the
  // reading has filled it in, the PDF is refiled as a receipt below, so it is
  // judged as one: a dropped Australian Uber PDF is not "not a red invoice".
  // Nor is a ride's: transport needs no invoice (RB.15), so its PDF is
  // judged as the receipt it is.
  const inVietnam = prefill.bought_in_vietnam ?? item.bought_in_vietnam === true;
  const { flags, duplicateOfItemId } = flagsFor(reading, inVietnam && !documentOptional(after.category) ? kind : "receipt", buyer, facts.facts);

  const stored: StoredReading | null = reading ? { ...reading, file_id: String(file.id), read_at: new Date().toISOString() } : null;
  const { data: saved, error: saveError } = await updateReimbursementClaimItems({
    ...prefill,
    ...valued,
    ai_reading: stored as Json,
    ai_flags: flags,
    duplicate_of_item_id: duplicateOfItemId,
  })
    .eq("id", String(item.id))
    .select("id");
  if (saveError) return { ok: false, error: receiptWriteError(saveError, `Could not save the reading: ${saveError.message}`) };
  if ((saved ?? []).length === 0) return { ok: false, error: "That receipt is no longer on the claim." };
  // The reading moved a dropped receipt abroad, so the PDF it started as a red invoice is a receipt.
  if (prefill.bought_in_vietnam === false) {
    const refiled = await refileAbroadInvoices({ itemId: String(item.id), claimId: claim.id, personId: null });
    if (!refiled.ok) return refiled;
  }
  return { ok: true, reading, flags };
}

/**
 * The checker's re-read of one item: its red invoice when it has one (the
 * buyer is checked there), else its newest receipt. The item must be on the
 * claim named; the caller's guard reaches every claim.
 */
export async function rereadItem(input: { claimId: string; itemId: string }): Promise<ReadOutcome> {
  const { data, error } = await selectReimbursementFiles("id, kind, created_at, reimbursement_claim_items!inner(claim_id)")
    .eq("claim_item_id", input.itemId)
    .eq("reimbursement_claim_items.claim_id", input.claimId)
    .not("confirmed_at", "is", null)
    .in("kind", ["receipt", "red_invoice"])
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: `Could not read the receipt's documents: ${error.message}` };
  const files = data ?? [];
  const pick = files.find((f) => f.kind === "red_invoice") ?? files[0];
  if (!pick) return { ok: false, error: "This receipt has no document to read." };
  return readReceipt(String(pick.id));
}

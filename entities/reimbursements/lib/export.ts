// The month-end export (plan section 11, design §3 RB.12): everything the
// bookkeeper needs to reconcile a month of reimbursements against the books.
// Two things, both for the claims PAID in that Vietnam calendar month:
//
// - a spreadsheet, one row per item: who claimed it, the claim, its trip, the
//   category, the seller, the date, the amount and currency as paid, the rate
//   and where it came from, the VND, whether it was declined (and why),
//   whether its owner removed it (and why), the client to rebill, the day it
//   was paid and the run that paid it;
// - a zip of every document behind those rows — receipts, red invoices and
//   the bank's receipts for the payments — named by claim and item, streamed
//   from storage to the response and never held in memory (zip-stream.ts).
//
// Nothing ever submitted is deleted (plan §10, 20261008090000): a receipt its
// owner removed and a document they replaced are kept, so both are here,
// each named with its marker, and neither is counted: a removed row's VND is
// 0 and it is rebilled to nobody, as a declined one is.
//
// The caller's guard is reimbursements.pay. Every read is a must-read: a
// failed read is an error, never a month that looks empty.
import { mustRows } from "@/kernel/data/read";
import { supabase } from "@/kernel/data/supabase";
import { personName } from "@/kernel/config/people-name";
import { businessDate } from "@/kernel/config/dates";
import { toCsv, type CsvRow } from "@/kernel/ui/dash/csv";
import { CLAIM_CATEGORY_LABEL, isClaimCategory } from "./categories";
import { RECEIPTS_BUCKET } from "./claim-files";
import { typedFromMinor } from "./currencies";
import { CLAIM_OWNER_EMBED } from "./my-claims";
import { selectReimbursementClaimItems, selectReimbursementClaims, selectReimbursementFiles, selectReimbursementPaymentRuns, selectReimbursementPayments } from "./reads";
import { readTrip } from "./trips";
import { ZIP_LIMIT_BYTES, type ZipEntry } from "./zip-stream";

/** A month as the export names it, YYYY-MM. */
export function isExportMonth(month: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

/** The month's bounds as UTC instants: 00:00 Vietnam time on its 1st, and on the next month's. Pure. */
export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { from: new Date(`${month}-01T00:00:00+07:00`).toISOString(), to: new Date(`${next}-01T00:00:00+07:00`).toISOString() };
}

type PaidClaim = { id: string; title: string; ownerName: string; tripEventId: string | null; paidAt: string; runId: string | null; paymentId: string | null };

async function paidClaims(month: string): Promise<PaidClaim[]> {
  const { from, to } = monthBounds(month);
  const rows = mustRows(
    await selectReimbursementClaims(`id, title, trip_event_id, paid_at, payment_run_id, payment_id, ${CLAIM_OWNER_EMBED}`)
      .eq("status", "paid")
      .gte("paid_at", from)
      .lt("paid_at", to)
      .order("paid_at"),
    "[reimbursements] the month's paid claims",
  );
  return rows.map((c) => ({
    id: String(c.id),
    title: String(c.title ?? ""),
    ownerName: personName((c.owner ?? null) as Parameters<typeof personName>[0], "Someone"),
    tripEventId: (c.trip_event_id as string | null) ?? null,
    paidAt: String(c.paid_at),
    runId: (c.payment_run_id as string | null) ?? null,
    paymentId: (c.payment_id as string | null) ?? null,
  }));
}

const ITEM_COLUMNS =
  "id, claim_id, position, description, seller, bought_on, category, amount_cents, currency, fx_rate, fx_source, fx_as_of, amount_vnd, declined_at, decline_reason, removed_at, remove_reason, rebill, rebill_company:companies!reimbursement_claim_items_rebill_company_id_fkey(name)";

/** The month's spreadsheet: one row per item of every claim paid in it, in the order they were paid. */
export async function exportSpreadsheet(month: string): Promise<string> {
  const claims = await paidClaims(month);
  if (claims.length === 0) return toCsv([]);
  const items = mustRows(
    await selectReimbursementClaimItems(ITEM_COLUMNS)
      .in(
        "claim_id",
        claims.map((c) => c.id),
      )
      .order("position"),
    "[reimbursements] the month's paid items",
  );
  const runIds = [...new Set(claims.map((c) => c.runId).filter((id): id is string => !!id))];
  const runs =
    runIds.length === 0 ? [] : mustRows(await selectReimbursementPaymentRuns("id, run_date").in("id", runIds), "[reimbursements] the month's runs");
  const runDate = new Map(runs.map((r) => [String(r.id), String(r.run_date)]));
  const tripIds = [...new Set(claims.map((c) => c.tripEventId).filter((id): id is string => !!id))];
  const trips = new Map((await Promise.all(tripIds.map(async (id) => [id, (await readTrip(id))?.title ?? ""] as const))).map(([id, t]) => [id, t]));

  const rows: CsvRow[] = [];
  for (const c of claims) {
    for (const i of items.filter((x) => x.claim_id === c.id)) {
      const category = String(i.category);
      const currency = String(i.currency);
      const company = i.rebill_company as { name?: unknown } | null;
      const counted = !i.declined_at && !i.removed_at;
      rows.push({
        Claimant: c.ownerName,
        Claim: c.title,
        "Claim id": c.id,
        Event: c.tripEventId ? (trips.get(c.tripEventId) ?? "") : "",
        Category: isClaimCategory(category) ? CLAIM_CATEGORY_LABEL[category] : category,
        Seller: (i.seller as string | null) ?? "",
        Description: (i.description as string | null) ?? "",
        Date: (i.bought_on as string | null) ?? "",
        "Original amount": typedFromMinor(Number(i.amount_cents), currency),
        Currency: currency.toUpperCase(),
        Rate: i.fx_rate === null || i.fx_rate === undefined ? "" : Number(i.fx_rate),
        "Rate source": String(i.fx_source ?? ""),
        "Rate date": (i.fx_as_of as string | null) ?? "",
        VND: counted ? Number(i.amount_vnd ?? 0) : 0,
        Declined: i.declined_at ? `Yes: ${String(i.decline_reason ?? "")}` : "No",
        Removed: i.removed_at ? `Yes: ${String(i.remove_reason ?? "")}` : "No",
        "Rebill to": i.rebill === true && !i.removed_at ? String(company?.name ?? "") : "",
        "Paid on": businessDate(c.paidAt),
        "Payment run": c.runId ? (runDate.get(c.runId) ?? "") : "",
      });
    }
  }
  return toCsv(rows);
}

/** A path segment that every unzip tool and filesystem accepts. Pure. */
export function safeSegment(text: string, max = 60): string {
  return (
    text
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .replace(/[^A-Za-z0-9 ._-]+/g, "-")
      .replace(/\s+/g, " ")
      .replace(/-+/g, "-")
      .trim()
      .slice(0, max)
      .replace(/^[.\- ]+|[.\- ]+$/g, "") || "file"
  );
}

const extOf = (filename: string) => {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(filename);
  return m ? `.${m[1].toLowerCase()}` : "";
};

export type ExportDocument = { name: string; storagePath: string; sizeBytes: number };

/** The month's documents, each with its name in the bundle: by claim, then by item. */
export async function exportDocuments(month: string): Promise<ExportDocument[]> {
  const claims = await paidClaims(month);
  if (claims.length === 0) return [];
  const folder = new Map(claims.map((c) => [c.id, `${businessDate(c.paidAt)} ${safeSegment(c.ownerName, 40)} - ${safeSegment(c.title, 50)} [${c.id.slice(0, 8)}]`]));
  const files = mustRows(
    await selectReimbursementFiles(
      "id, kind, filename, storage_path, size_bytes, replaced_at, reimbursement_claim_items!inner(claim_id, position, seller, category, removed_at)",
    )
      .in(
        "reimbursement_claim_items.claim_id",
        claims.map((c) => c.id),
      )
      .in("kind", ["receipt", "red_invoice"])
      .not("confirmed_at", "is", null)
      .order("created_at"),
    "[reimbursements] the month's receipts",
  );
  const out: ExportDocument[] = [];
  for (const f of files) {
    const item = f.reimbursement_claim_items as { claim_id: string; position: number; seller: string | null; category: string; removed_at?: string | null };
    const what = `${safeSegment(item.seller || item.category, 40)}${item.removed_at ? " (removed)" : ""}`;
    const kind = `${f.kind === "red_invoice" ? "red invoice" : "receipt"}${f.replaced_at ? " (replaced)" : ""}`;
    out.push({
      name: `${folder.get(item.claim_id)}/item ${String(Number(item.position) + 1).padStart(2, "0")} ${what} - ${kind}${extOf(String(f.filename))}`,
      storagePath: String(f.storage_path),
      sizeBytes: Number(f.size_bytes ?? 0),
    });
  }
  // The bank's receipts: one per payment, which may cover several of a person's claims.
  const paymentIds = [...new Set(claims.map((c) => c.paymentId).filter((id): id is string => !!id))];
  if (paymentIds.length > 0) {
    const payments = mustRows(await selectReimbursementPayments("id, bank_receipt_file_id").in("id", paymentIds), "[reimbursements] the month's payments");
    const receiptIds = payments.map((p) => p.bank_receipt_file_id).filter((id): id is string => typeof id === "string");
    const receipts =
      receiptIds.length === 0
        ? []
        : mustRows(await selectReimbursementFiles("id, filename, storage_path, size_bytes, payment_id").in("id", receiptIds), "[reimbursements] the month's bank receipts");
    for (const r of receipts) {
      const paid = claims.filter((c) => c.paymentId === r.payment_id);
      const first = paid[0];
      if (!first) continue;
      out.push({
        name: `bank receipts/${businessDate(first.paidAt)} ${safeSegment(first.ownerName, 40)} - ${paid.map((c) => c.id.slice(0, 8)).join(" ")}${extOf(String(r.filename))}`,
        storagePath: String(r.storage_path),
        sizeBytes: Number(r.size_bytes ?? 0),
      });
    }
  }
  return out;
}

/** Whether a bundle of these documents fits a plain zip, said before any byte is sent. Pure. */
export function bundleFits(docs: Pick<ExportDocument, "name" | "sizeBytes">[]): boolean {
  // Each entry adds its name twice and about 92 bytes of headers.
  const overhead = docs.reduce((sum, d) => sum + 2 * d.name.length + 92, 22);
  return docs.reduce((sum, d) => sum + d.sizeBytes, overhead) <= ZIP_LIMIT_BYTES;
}

/** How long each document's download link lasts: long enough to start reading it. */
const LINK_SECONDS = 120;

/**
 * The documents as zip entries: each one's bytes are asked for only when the
 * zip reaches it, through a short signed link fetched as a stream, so a
 * bundle that takes minutes never holds an expired link or a whole file.
 */
export function zipEntriesOf(docs: ExportDocument[]): ZipEntry[] {
  return docs.map((d) => ({
    name: d.name,
    open: async () => {
      const { data, error } = await supabase.storage.from(RECEIPTS_BUCKET).createSignedUrl(d.storagePath, LINK_SECONDS);
      if (error || !data) return null;
      const res = await fetch(data.signedUrl, { cache: "no-store" });
      return res.ok && res.body ? res.body : null;
    },
  }));
}

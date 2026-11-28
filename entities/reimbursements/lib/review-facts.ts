// What a decider reads off one receipt at a glance (RB.14): whether what the
// owner claimed agrees with what the AI read on the document, field by field,
// and the one chip a queue row or a claim's receipt row shows for it. The AI
// reading is a suggestion and its flags are warnings (design §1.9): nothing
// here blocks a check or an approval, it only says where to look. Pure.
import { formatDate } from "@/kernel/ui/format";
import { CLAIM_CATEGORY_LABEL, type ClaimCategory } from "./categories";
import type { ReceiptFlag } from "./claim-labels";
import type { StoredReading } from "./receipt-reading";

/** An amount as printed: whole dong, or the currency's minor unit with two decimals and its code. */
export function amountText(minor: number | null, currency: string | null): string {
  if (minor === null) return "—";
  const code = (currency ?? "").toUpperCase();
  if (code === "VND" || code === "") return `${minor.toLocaleString("en-US")} ₫`;
  return `${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${code}`;
}

/** The facts of one receipt the check reads, as MyItem carries them. */
export type ReviewedItem = {
  amount: number;
  currency: string;
  boughtOn: string | null;
  seller: string | null;
  category: ClaimCategory;
  declined: boolean;
  removed: boolean;
  reading: StoredReading | null;
  flags: ReceiptFlag[];
};

export type CompareRow = { field: string; claimed: string; read: string; differs: boolean };
export type CheckTone = "ok" | "warn" | "err" | "neutral";
export type ReceiptCheck = {
  tone: CheckTone;
  /** The chip: "Matches", "Date differs", "Declined"… Null for a receipt the AI has not read: no chip (RB.17, Mai). */
  label: string | null;
  /** Claimed beside AI read, for the receipt's detail; empty when nothing was read. */
  rows: CompareRow[];
  /** A plain-words hint about a difference the reading likely got wrong, or null. */
  hint: string | null;
};

/** The same date with its month and day exchanged, or null when that is no date. */
function swapped(iso: string): string | null {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d || Number(d) > 12) return null;
  return `${y}-${d}-${m}`;
}

/**
 * Whether the claim and the reading agree, and the chip for it. Amount and
 * date are compared; a seller's name and the category are shown side by side
 * but never called a difference, because a trading name and its legal name,
 * or two fair categories, are not a mistake. A date read with its day and
 * month exchanged gets a hint: a receipt printed day first (1/10/26) is read
 * month first by the model often enough to say so.
 */
export function receiptCheck(item: ReviewedItem): ReceiptCheck {
  const r = item.reading;
  const rows: CompareRow[] = r
    ? [
        {
          field: "Amount",
          claimed: amountText(item.amount, item.currency),
          read: amountText(r.amount_minor, r.currency),
          differs: r.amount_minor !== null && (r.amount_minor !== item.amount || (r.currency ?? "").toLowerCase() !== item.currency.toLowerCase()),
        },
        {
          field: "Date",
          claimed: item.boughtOn ? formatDate(item.boughtOn) : "—",
          read: r.bought_on ? formatDate(r.bought_on) : "—",
          differs: !!r.bought_on && !!item.boughtOn && r.bought_on !== item.boughtOn,
        },
        { field: "Seller", claimed: item.seller ?? "—", read: r.seller ?? "—", differs: false },
        { field: "Category", claimed: CLAIM_CATEGORY_LABEL[item.category], read: r.category ? CLAIM_CATEGORY_LABEL[r.category] : "—", differs: false },
      ]
    : [];
  const dateRow = rows.find((x) => x.field === "Date");
  const hint =
    dateRow?.differs && r?.bought_on && item.boughtOn && swapped(r.bought_on) === item.boughtOn
      ? "The AI read the date month first. Many receipts print the day first, so the claimed date is likely right."
      : null;

  if (item.removed) return { tone: "neutral", label: "Removed", rows, hint };
  if (item.declined) return { tone: "err", label: "Declined", rows, hint };
  if (!r) return { tone: "neutral", label: null, rows, hint };
  const amountDiffers = rows[0].differs;
  const dateDiffers = !!dateRow?.differs;
  if (amountDiffers && dateDiffers) return { tone: "warn", label: "Amount and date differ", rows, hint };
  if (amountDiffers) return { tone: "warn", label: "Amount differs", rows, hint };
  if (dateDiffers) return { tone: "warn", label: "Date differs", rows, hint };
  if (item.flags.length > 0) return { tone: "warn", label: item.flags.length === 1 ? "1 warning" : `${item.flags.length} warnings`, rows, hint };
  return { tone: "ok", label: "Matches", rows, hint };
}

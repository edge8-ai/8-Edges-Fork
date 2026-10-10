// Shared formatters for the admin CRM. Money is always stored as integer cents
// (bigint columns) — never do float arithmetic on it; format only at the edge.
import { BUSINESS_TIME_ZONE } from "@/kernel/config/dates";

export function formatCents(cents: number | string | null | undefined, currency = "usd"): string {
  if (cents === null || cents === undefined || cents === "") return "—";
  const n = typeof cents === "string" ? Number(cents) : cents;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: (currency || "usd").toUpperCase(),
    maximumFractionDigits: 0,
  }).format(n / 100);
}

// Whole VND (NOT cents). VND is a zero-decimal currency; salary_vnd stores the
// actual dong amount, so it must not go through formatCents (which divides by
// 100). e.g. 45000000 -> "₫45,000,000".
export function formatVndWhole(vnd: number | string | null | undefined): string {
  if (vnd === null || vnd === undefined || vnd === "") return "—";
  const n = typeof vnd === "string" ? Number(vnd) : vnd;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  // A date-only string ("2026-09-05") is parsed by JS as UTC midnight, so in
  // any zone west of UTC it renders as the previous day. Anchor it to local
  // midnight instead — the nine screen-local formatters this replaced all did
  // exactly this, and a calendar date has no time zone to lose.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const d = dateOnly ? new Date(`${iso}T00:00:00`) : new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  // A full timestamp is read as a business-day date in one fixed zone. Left to the
  // machine's own zone, a card completed at 20:00 UTC rendered "Sep 20" on the server and
  // "Sep 21" in a Saigon browser, and React reported the text mismatch on every Workboard
  // page (hydration error 425, found 2026-09-21). A date-only string keeps local midnight:
  // it names a calendar day already and has no zone to lose.
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(dateOnly ? {} : { timeZone: BUSINESS_TIME_ZONE }),
  });
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  if (Number.isNaN(ms)) return "—";
  const sec = Math.round(ms / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);
  if (sec < 60) return "just now";
  if (min < 60) return `${min}m ago`;
  if (hr < 24) return `${hr}h ago`;
  if (day < 30) return `${day}d ago`;
  return formatDate(iso);
}

// "new_lead" → "New lead", "private_session" → "Private session"
export function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  const s = value.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// File sizes for document lists: "512 B", "48 KB", "1.2 MB". Null/undefined
// (size unknown) render as "" so the cell simply stays blank.
export function formatBytes(n: number | null | undefined): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  // A file over the 500 MB deliverable cap is refused by its size (W.128):
  // "4.1 GB" reads; "4198.4 MB" makes the reader do the arithmetic.
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// Program hours for the portal KPI strips: round to one decimal, then group
// thousands in en-US. The locale is pinned (not the viewer's) so a server-
// rendered figure and a client re-render can never disagree. The team and admin
// program views deliberately format hours in the *viewer's* locale instead and
// keep their own helper.
export function formatHours(n: number): string {
  return (Math.round(n * 10) / 10).toLocaleString("en-US", { maximumFractionDigits: 1 });
}

// Avatar fallback: first letter of the first and last words, upper-cased
// ("Nguyễn Thị Mai" → "NM", "Dave" → "D"). Every name-based monogram on the
// team and portal surfaces uses this; AdminSidebar keeps its own because it
// derives the letters from an email local part, not a name.
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  // A one-word name keeps two letters ("Mai" -> "MA"): an avatar badge needs a
  // two-character monogram, and every screen-local rule this replaced did this.
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

// Fold a string for search: lower-case, strip combining marks, and map the
// Vietnamese đ/Đ (which is not a base letter plus a mark) to d. "Đặng Phương"
// becomes "dang phuong", so typing "dang" finds her. Apply to both sides.
export function searchFold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

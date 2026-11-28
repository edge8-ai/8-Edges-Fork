// What the screens receive about the inquiry-to-lead chain (Z.11): plain data,
// safe to hand to a client component. The words for each value live here too,
// so the Leads card and the Inquiries board say the same thing.

/** What the qualifier writes for a question the visitor did not answer. */
export const NOT_STATED = "Not stated";

export type GpctView = { goal: string; plan: string; challenge: string; timeline: string; budget: string; authority: string };

/** Whether the inquiry's Operations line went out. */
export type NoticeState = "posted" | "shadow" | "pending" | "unknown" | "none";

export type QualifierView = {
  inquiryId: string;
  mode: "live" | "shadow";
  step: string;
  error: string | null;
  verdict: string | null;
  notSalesKind: string | null;
  fit: number | null;
  reasons: string[];
  gpct: GpctView | null;
  injectionSuspected: boolean;
  company: { id: string; name: string; linked: boolean; created: boolean } | null;
  duplicates: { id: string; name: string }[];
  customer: { title: string | null; companyId: string | null; ownerName: string | null } | null;
  /** Where it was filed, or in shadow where it would have been. */
  routed: string | null;
  review: string | null;
  correctedVerdict: string | null;
  correctedFit: number | null;
  notice: string | null;
  noticeState: NoticeState;
  openedAt: string;
  qualifiedAt: string | null;
  filedAt: string | null;
  notifiedAt: string | null;
};

export type HeldInquiry = { inquiryId: string; name: string; heldAt: string | null; reason: string | null };

export type ChipTone = "ok" | "info" | "warn" | "err" | "neutral";

const KIND_WORDS: Record<string, string> = {
  job_seeker: "Job seeker",
  vendor: "Vendor pitch",
  support: "Support request",
  partnership: "Partnership",
  other: "Not sales",
};

/** The chip a card carries for the qualifier's read. */
export function qualifierChip(q: QualifierView): { label: string; tone: ChipTone } {
  const verdict = q.review === "corrected" ? q.correctedVerdict : q.verdict;
  const fit = q.review === "corrected" ? q.correctedFit : q.fit;
  if (!verdict) return q.step === "stopped" ? { label: "Stopped", tone: "err" } : { label: "Being read", tone: "warn" };
  if (q.customer && verdict === "sales") return { label: "From a current client", tone: "info" };
  switch (verdict) {
    case "sales":
      return { label: fit === null ? "Sales" : `Sales · fit ${fit}/5`, tone: fit !== null && fit >= 4 ? "ok" : fit === 3 ? "info" : "neutral" };
    case "not_sales":
      return { label: KIND_WORDS[q.notSalesKind ?? "other"] ?? KIND_WORDS.other, tone: "neutral" };
    case "spam":
      return { label: "Spam", tone: "err" };
    default:
      return { label: "Not read", tone: "warn" };
  }
}

/** The fit chip on a Leads card. */
export function fitChip(q: QualifierView | null): { label: string; tone: ChipTone } | null {
  if (!q) return null;
  const verdict = q.review === "corrected" ? q.correctedVerdict : q.verdict;
  const fit = q.review === "corrected" ? q.correctedFit : q.fit;
  if (!verdict) return { label: "Being read", tone: "warn" };
  if (verdict === "needs_a_person" || fit === null) return { label: "Not read", tone: "warn" };
  return { label: `Fit ${fit}/5`, tone: fit >= 4 ? "ok" : fit === 3 ? "info" : "neutral" };
}

export const VERDICT_WORDS: Record<string, string> = {
  sales: "Sales inquiry",
  not_sales: "Not a sales inquiry",
  spam: "Spam",
  needs_a_person: "Not read",
};

/** The choices a person corrects a read with, and the verdict each one records. */
export const CORRECTION_CHOICES = [
  ["sales", "A sales inquiry"],
  ["not_sales", "A job seeker, vendor or support request"],
  ["spam", "Spam"],
] as const;

export const ROUTED_WORDS: Record<string, string> = {
  queued: "Promoted to the Leads queue",
  held_spam: "Held as spam on this board, no lead",
  kept_on_board: "Kept on this board, no lead",
  customer_owner: "No lead: a note on the client for its owner",
  fallback: "Promoted to the Leads queue as before, marked Not read",
};

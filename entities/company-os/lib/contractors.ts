import type { BadgeTone } from "@/kernel/ui/Badge";

// Contractor work-request workflow. Statuses are constrained at the DB
// (company_os.contractor_work_requests status check) — keep in sync.
// Plan: docs/plans/2026-07-16-contractor-work-requests.md

export const WORK_REQUEST_STATUSES = [
  "draft",
  "awaiting_estimate",
  "estimate_submitted",
  "changes_requested",
  "scope_added",
  "approved",
  "rejected",
  "work_submitted",
  "completed",
  "cancelled",
] as const;
export type WorkRequestStatus = (typeof WORK_REQUEST_STATUSES)[number];

export const WORK_REQUEST_STATUS_LABEL: Record<WorkRequestStatus, string> = {
  draft: "Draft",
  awaiting_estimate: "Awaiting estimate",
  estimate_submitted: "Estimate submitted",
  changes_requested: "Changes requested",
  scope_added: "Scope added",
  approved: "Approved",
  rejected: "Rejected",
  work_submitted: "Work submitted",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function workRequestTone(status: string): BadgeTone {
  switch (status) {
    case "approved":
    case "completed":
      return "ok";
    case "rejected":
    case "cancelled":
      return "err";
    case "estimate_submitted":
    case "work_submitted":
      return "warn";
    case "awaiting_estimate":
    case "changes_requested":
    case "scope_added":
      return "info";
    default:
      return "neutral";
  }
}

// Payment lifecycle (company_os.contractor_payments status check).
export const PAYMENT_STATUSES = ["pending", "paid", "rejected", "info_requested"] as const;

export function paymentTone(status: string): BadgeTone {
  switch (status) {
    case "paid":
      return "ok";
    case "rejected":
      return "err";
    case "info_requested":
      return "warn";
    default:
      return "info";
  }
}

// PostgREST returns numeric columns as numbers or strings depending on
// magnitude — normalize before arithmetic.
export function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : 0;
}

// Payment maths: hours × rate summed in cents, rounded once at the end.
// Rates come from company_os.compensation (comp_type 'hourly' / 'overtime').
export function computeAmountCents(
  regularHours: number,
  overtimeHours: number,
  hourlyRateCents: number,
  overtimeRateCents: number,
): number {
  return Math.round(regularHours * hourlyRateCents + overtimeHours * overtimeRateCents);
}

export function formatHours(v: number | string | null | undefined): string {
  const n = num(v);
  const rounded = Math.round(n * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(2)}h`;
}

export const workRequestPath = (token: string) => `/work/${token}`;

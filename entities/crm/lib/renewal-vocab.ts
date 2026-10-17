import { diffDays } from "@/kernel/config/dates";

// The renewal vocabulary (S.6): statuses, their labels and the two date rules,
// with no database import, so the company page's client-side Renewal card and
// the server reads share one copy.

export const RENEWAL_STATUSES = ["upcoming", "renewed", "churned", "lapsed"] as const;
export type RenewalStatus = (typeof RENEWAL_STATUSES)[number];

export const RENEWAL_STATUS_LABEL: Record<RenewalStatus, string> = {
  upcoming: "Upcoming",
  renewed: "Renewed",
  churned: "Churned",
  lapsed: "Lapsed",
};

export type Renewal = {
  id: string;
  company_id: string;
  renews_on: string;
  term_months: number | null;
  status: RenewalStatus;
  note: string | null;
};

/** How far ahead a renewal counts as coming up, on the screen and the card alike. */
export const RENEWAL_SOON_DAYS = 60;

/**
 * Whether an upcoming renewal falls within the next RENEWAL_SOON_DAYS days. A
 * date already past still counts while the status says upcoming: nobody has
 * recorded what happened, which is more urgent than a date next month, not less.
 */
export function renewalDueSoon(r: Pick<Renewal, "renews_on" | "status"> | null, today: string): boolean {
  if (!r || r.status !== "upcoming") return false;
  return diffDays(today, r.renews_on) <= RENEWAL_SOON_DAYS;
}

/** "in 12 days", "today", "3 days ago": the renewal date relative to today. */
export function renewalDistance(renewsOn: string, today: string): string {
  const d = diffDays(today, renewsOn);
  if (d === 0) return "today";
  const n = Math.abs(d);
  const unit = n === 1 ? "day" : "days";
  return d > 0 ? `in ${n} ${unit}` : `${n} ${unit} ago`;
}

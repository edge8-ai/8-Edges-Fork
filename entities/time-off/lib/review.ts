// Balance review: the warnings a manager should look at before trusting a
// balance, and the sign-off that says someone checked it.
//
// A sign-off is an audit_log row (table_name "leave_balances", record_id the
// team member) rather than a table of its own: it is a fact about who looked
// at what and when, which is what the audit log records. It carries a
// fingerprint of the balance it confirmed, so any later change (new leave, an
// adjustment, a policy edit, a new posting) makes it stale and the balance asks
// to be checked again.
import { companyOs } from "@/kernel/data/supabase";
import { recordAudit } from "@/kernel/audit/audit";
import { hoursToDays } from "./balance";
import type { MemberLeave } from "./balances";

export const REVIEW_TABLE = "leave_balances";

export type LeaveWarning = {
  kind: "over_entitlement" | "negative_balance" | "no_policy_start" | "opening_unconfirmed";
  text: string;
};

export type BalanceReview = {
  reviewerLabel: string | null;
  reviewedAt: string;
  // False when the balance has changed since it was confirmed.
  current: boolean;
};

// What a confirmation vouches for: the inputs a person checks, not the running
// total. Routine postings follow from the policy rules, so a balance that only
// accrued since it was confirmed stays confirmed; a change to the rules, the
// dates, the opening figures, an adjustment or leave taken makes it stale.
export function balanceFingerprint(leave: MemberLeave): string | null {
  const b = leave.balance;
  if (!b) return null;
  const leaveTaken = b.ledger
    .filter((l) => l.kind === "usage" || l.kind === "adjustment")
    .map((l) => `${l.date}:${l.kind}:${l.hours}`)
    .join(",");
  return [
    leave.policy?.id ?? "",
    JSON.stringify(leave.policy?.accrual ?? null),
    leave.anniversaryDate ?? "",
    b.anchorHours,
    b.usedAllTimeHours,
    b.adjustedHours,
    leaveTaken,
  ].join("|");
}

// Pure: the checks a person would make by eye, from the calculation alone.
// The opening-balance warning depends on the review, so the caller passes it.
export function leaveWarnings(leave: MemberLeave, review: BalanceReview | null): LeaveWarning[] {
  const out: LeaveWarning[] = [];
  const b = leave.balance;
  const hpd = leave.policy?.accrual.hoursPerDay ?? 8;
  const days = (h: number) => hoursToDays(h, hpd);
  if (leave.policy && leave.policy.accrual.cadence !== "none" && !leave.probationRecorded) {
    out.push({
      kind: "no_policy_start",
      text: leave.anniversaryDate
        ? "No probation end date is recorded, so the policy year counts from the start date."
        : "No start or probation end date is recorded, so no balance can be worked out.",
    });
  }
  if (!b) return out;
  if (b.remainingHours < 0) {
    out.push({ kind: "negative_balance", text: `The balance is negative: ${days(b.remainingHours)} days.` });
  }
  if (b.tier && b.usedPolicyYearHours > b.tier.hoursPerYear) {
    out.push({
      kind: "over_entitlement",
      text: `${days(b.usedPolicyYearHours)} days used this policy year against an entitlement of ${days(b.tier.hoursPerYear)} days a year.`,
    });
  }
  if (leave.opening && !review?.current) {
    out.push({
      kind: "opening_unconfirmed",
      text: `The opening balance of ${days(b.anchorHours)} days on ${leave.opening.date} was imported and has not been confirmed.`,
    });
  }
  return out;
}

type AuditRow = { record_id: string; actor_label: string | null; changed_at: string; new_data: unknown };

// The latest sign-off per member, marked current when its fingerprint still
// matches today's balance.
export async function getBalanceReviews(leaveById: Map<string, MemberLeave>): Promise<Map<string, BalanceReview>> {
  const out = new Map<string, BalanceReview>();
  const ids = [...leaveById.keys()];
  if (ids.length === 0) return out;
  const { data, error } = await companyOs
    .from("audit_log")
    .select("record_id, actor_label, changed_at, new_data")
    .eq("table_name", REVIEW_TABLE)
    .in("record_id", ids)
    .order("changed_at", { ascending: false });
  if (error) {
    console.error("[time-off] balance reviews read failed:", error.message);
    return out;
  }
  for (const r of (data ?? []) as unknown as AuditRow[]) {
    if (out.has(r.record_id)) continue;
    const confirmed = (r.new_data as { fingerprint?: string } | null)?.fingerprint ?? null;
    const leave = leaveById.get(r.record_id);
    out.set(r.record_id, {
      reviewerLabel: r.actor_label,
      reviewedAt: r.changed_at,
      current: !!leave && confirmed !== null && confirmed === balanceFingerprint(leave),
    });
  }
  return out;
}

// Records that `reviewer` checked this balance as it stands now. The caller has
// already authorized the reviewer for this member.
export async function recordBalanceReview(leave: MemberLeave, reviewer: string, context: Record<string, unknown>) {
  const fingerprint = balanceFingerprint(leave);
  if (!fingerprint) return { ok: false as const, error: "There is no balance to confirm." };
  await recordAudit({
    table: REVIEW_TABLE,
    recordId: leave.teamMemberId,
    operation: "insert",
    actor: reviewer,
    newData: { fingerprint, remaining_hours: leave.balance?.remainingHours ?? null },
    context,
  });
  return { ok: true as const };
}

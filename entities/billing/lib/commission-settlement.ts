// How a settled affiliate commission was settled. A payout row settles a
// commission and its `method` says how: "work_credit" means the credit was
// applied to the affiliate's Human Tokens rather than paid in cash, and every
// surface labels it "Applied" instead of "Paid". Shared by the admin affiliate
// views (company-os) and the client referrals page (portal) so the two never
// read the same payout differently.
export type CommissionSettlement = "work_credit" | "cash" | null;

export function settledAs(payoutId: string | null, method: string | null): CommissionSettlement {
  if (!payoutId) return null;
  return method === "work_credit" ? "work_credit" : "cash";
}

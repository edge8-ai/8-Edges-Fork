// The questions crm asks of affiliate_commissions, and the redemption choice
// crm and the client portal record on one (A.69, ADR 0018). Until A.69 the
// door handed out `selectAffiliateCommissions(columns)` and
// `updateAffiliateCommissions(patch)`, and each caller built its own query.
// Each question and command here makes exactly the statement its caller made.
import { companyOs } from "@/kernel/data/supabase";
import type { Embedded } from "@/kernel/config/embedded";

/** One commission's gross and payout, or null: what an admin's redemption choice is computed from. */
export async function commissionForRedemption(commissionId: string) {
  return companyOs.from("affiliate_commissions").select("id, gross_cents, payout_id").eq("id", commissionId).maybeSingle();
}

/**
 * Records how a commission is redeemed: the choice, the rate it carries and
 * the commission that rate yields, stamped now. The caller has already checked
 * the commission is not paid out and worked out the amount.
 */
export async function recordCommissionRedemption(
  commissionId: string,
  redemption: { choice: "work_credit" | "cash"; rate: number; commissionCents: number },
) {
  return companyOs
    .from("affiliate_commissions")
    .update({
      redemption_choice: redemption.choice,
      rate: redemption.rate,
      commission_cents: redemption.commissionCents,
      chosen_at: new Date().toISOString(),
    })
    .eq("id", commissionId);
}

/** The commission figures of these affiliate codes: a company's affiliate totals. */
export async function commissionTotalsOf(affiliateIds: string[]) {
  return companyOs
    .from("affiliate_commissions")
    .select("gross_cents, commission_cents, redemption_choice, payout_id")
    .in("affiliate_id", affiliateIds);
}

/** Every commission's figures, by affiliate code: the grouped affiliates list. */
export async function everyCommissionTotal() {
  return companyOs.from("affiliate_commissions").select("affiliate_id, gross_cents, commission_cents, redemption_choice, payout_id");
}

/** A commission as one affiliate's detail page lists it, with how its payout was made. */
export type AffiliateCommissionRow = {
  id: string;
  affiliate_id: string;
  source_event: string;
  source_ref: string | null;
  gross_cents: number;
  rate: number | null;
  commission_cents: number | null;
  redemption_choice: string | null;
  chosen_at: string | null;
  payout_id: string | null;
  notes: string | null;
  created_at: string;
  payout: Embedded<{ method: string | null }>;
};

/** Every commission of these affiliate codes, newest first, with its payout's method: one affiliate's detail page. */
export async function commissionsOf(affiliateIds: string[]) {
  const { data, error } = await companyOs
    .from("affiliate_commissions")
    .select(
      "id, affiliate_id, source_event, source_ref, gross_cents, rate, commission_cents, redemption_choice, chosen_at, payout_id, notes, created_at, payout:affiliate_payouts!payout_id(method)",
    )
    .in("affiliate_id", affiliateIds)
    .order("created_at", { ascending: false });
  return { data: data as unknown as AffiliateCommissionRow[] | null, error };
}

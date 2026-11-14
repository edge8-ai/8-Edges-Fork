import { companyOs } from "@/kernel/data/supabase";
import { currentBillableRate } from "@/entities/finance";

// What a contractor's hour costs the client, for work-request billing. It moved
// here from company-os's client invoicing when finance took the invoicing and
// work-requests took the rest of the flow (ADR 0025; Khoa, 2026-11-01).
/**
 * The contractor's current client-billable rate in USD cents, resolved via
 * team_members → compensation (comp_type 'billable', default 100% markup on
 * the internal hourly). `null` when no current billable row exists.
 */
export async function billableRateCents(personId: string): Promise<number | null> {
  const { data: tm, error: tmErr } = await companyOs
    .from("team_members")
    .select("id")
    .eq("person_id", personId)
    .maybeSingle();
  if (tmErr || !tm) return null;
  const { data: comp, error: compErr } = await currentBillableRate(tm.id);
  if (compErr) return null;
  const cents = comp?.amount_cents;
  return typeof cents === "number" && cents > 0 ? cents : cents ? Number(cents) : null;
}

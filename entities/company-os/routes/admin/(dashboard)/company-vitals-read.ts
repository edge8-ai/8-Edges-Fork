// The rows behind the company's four vitals, read once here for both pages
// that show them: the Company Dashboard's top row and the Admin Home's Company
// card (AH.2.2). The arithmetic is lib/company-vitals.ts; these are the reads,
// which cross into finance, billing's orders, crm and the team, so they sit in
// the route code, where any door may be reached.
import { companyOs } from "@/kernel/data/supabase";
import { liveDealFigures } from "@/entities/crm";
import { liveInvoices } from "@/entities/finance";

export async function readVitalsRows() {
  const [invoicesRes, ordersRes, dealsRes, teamRes] = await Promise.all([
    liveInvoices(2000),
    companyOs.from("orders").select("created_at, amount_usd_cents, status").limit(2000),
    liveDealFigures(2000),
    companyOs.from("team_members").select("status, start_date").limit(1000),
  ]);
  return { invoicesRes, ordersRes, dealsRes, teamRes };
}

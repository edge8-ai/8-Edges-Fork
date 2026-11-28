// What each marketing campaign brought in (MK.1): inquiries, deals, deals won
// and the value won, by campaign id. Marketing's "Ideas that pulled" ranks
// ideas on it. The counting is the Demand tab's (aggregateDemand): an inquiry
// or a live deal counts toward the campaign its intake tagged, a won deal adds
// its value in whole US dollars. A failed read says so rather than answering
// "nothing", because "this idea brought in nothing" is a decision someone acts on.
import { selectInquiries } from "@/entities/crm/lib/reads";
import { dealsForDemand, type DemandDeal } from "./deals";
import { usdOf } from "./shared";

export type CampaignOutcome = { inquiries: number; deals: number; won: number; wonUsd: number };

export async function campaignOutcomes(): Promise<{ byCampaign: Map<string, CampaignOutcome>; error?: string }> {
  const [inq, deals] = await Promise.all([selectInquiries("campaign_id").not("campaign_id", "is", null).limit(5000), dealsForDemand()]);
  if (inq.error || deals.error) return { byCampaign: new Map(), error: (inq.error ?? deals.error)!.message };
  const byCampaign = new Map<string, CampaignOutcome>();
  const row = (id: string) => {
    const r = byCampaign.get(id) ?? { inquiries: 0, deals: 0, won: 0, wonUsd: 0 };
    byCampaign.set(id, r);
    return r;
  };
  for (const i of (inq.data ?? []) as { campaign_id: string | null }[]) if (i.campaign_id) row(i.campaign_id).inquiries++;
  for (const d of (deals.data ?? []) as DemandDeal[]) {
    if (!d.campaign_id || d.archived_at) continue;
    const r = row(d.campaign_id);
    r.deals++;
    if (d.status === "won") {
      r.won++;
      r.wonUsd += Math.round(usdOf(d) / 100);
    }
  }
  return { byCampaign };
}

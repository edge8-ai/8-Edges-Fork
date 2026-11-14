import { companyOs } from "@/kernel/data/supabase";
import { selectInquiries, selectMeetings } from "@/entities/crm/lib/reads";
import { dealsForDemand, type DemandDeal } from "./deals";
import { listCampaignOptions } from "@/entities/campaigns";
import { collectErrors, compared, countBy, monthKey, monthLabel, rangeWindows, sourceChannel, usdOf, DEFAULT_RANGE, type BucketCount, type Compared, type Loaded, type MonthPoint, type Range } from "./shared";

// The Demand tab's figures (RH-3): where inquiries arrive from, how many turn
// into deals, which channel the deals came through, and what each campaign
// produced through the campaign links. Every figure is about inquiries,
// deals and campaigns.

export type DemandInquiry = { id: string; created_at: string; source: string | null; source_site: string | null; type: string | null; status: string | null; deal_id: string | null; campaign_id: string | null };
export type { DemandDeal };
export type CampaignName = { id: string; name: string };
export type DemandMeeting = { started_at: string | null; meeting_type: string | null; archived_at: string | null };
// A row of interactions_by_month(): touches per month and kind, aggregated
// in Postgres so the page never pulls the interaction rows themselves.
export type TouchRow = { month: string; kind: string | null; n: number };

export type SourceRow = { channel: string; count: number; usd: number };
export type CampaignRow = { campaign: string; inquiries: number; deals: number; won: number; usd: number };

export type DemandMetrics = Loaded & {
  range: Range;
  inquiries: number;
  inquiriesInRange: Compared;
  linkedToDeal: number;
  archived: number;
  byMonth: MonthPoint[];
  bySite: BucketCount[];
  byType: BucketCount[];
  byStatus: BucketCount[];
  dealsByChannel: SourceRow[];
  campaigns: CampaignRow[];
  unattributed: { inquiries: number; deals: number };
  meetingsByMonth: MonthPoint[];
  meetingsInRange: Compared;
  meetingsByType: BucketCount[];
  interactionsByMonth: MonthPoint[];
  interactionsByKind: BucketCount[];
};

export type DemandInputs = { meetings?: DemandMeeting[]; touches?: TouchRow[]; range?: Range; errors?: string[] };

export function aggregateDemand(inquiries: DemandInquiry[], deals: DemandDeal[], campaigns: CampaignName[], now: Date, inputs: DemandInputs = {}): DemandMetrics {
  const range = inputs.range ?? DEFAULT_RANGE;
  const { months, prior } = rangeWindows(range, now);
  const liveMeetings = (inputs.meetings ?? []).filter((m) => !m.archived_at);
  const live = deals.filter((d) => !d.archived_at);
  const usd = (d: DemandDeal) => usdOf(d);
  const byChannel = new Map<string, SourceRow>();
  for (const d of live) {
    const channel = sourceChannel(d.source);
    const row = byChannel.get(channel) ?? { channel, count: 0, usd: 0 };
    row.count++;
    row.usd += Math.round(usd(d) / 100);
    byChannel.set(channel, row);
  }
  const names = new Map(campaigns.map((c) => [c.id, c.name]));
  const perCampaign = new Map<string, CampaignRow>();
  const rowFor = (id: string) => {
    const r = perCampaign.get(id) ?? { campaign: names.get(id) ?? "Unknown campaign", inquiries: 0, deals: 0, won: 0, usd: 0 };
    perCampaign.set(id, r);
    return r;
  };
  for (const i of inquiries) if (i.campaign_id) rowFor(i.campaign_id).inquiries++;
  for (const d of live) {
    if (!d.campaign_id) continue;
    const r = rowFor(d.campaign_id);
    r.deals++;
    if (d.status === "won") {
      r.won++;
      r.usd += Math.round(usd(d) / 100);
    }
  }
  const inqIn = (keys: string[]) => inquiries.filter((i) => keys.includes(monthKey(i.created_at) ?? "")).length;
  const mtgIn = (keys: string[]) => liveMeetings.filter((m) => keys.includes(monthKey(m.started_at) ?? "")).length;
  const touches = inputs.touches ?? [];
  const kindTotals = new Map<string, number>();
  for (const t of touches) kindTotals.set(t.kind || "unknown", (kindTotals.get(t.kind || "unknown") ?? 0) + Number(t.n));
  return {
    errors: inputs.errors ?? [],
    range,
    inquiries: inquiries.length,
    inquiriesInRange: compared(inqIn(months), inqIn(prior)),
    linkedToDeal: inquiries.filter((i) => i.deal_id).length,
    archived: inquiries.filter((i) => i.status === "archived").length,
    byMonth: months.map((month) => ({ month, label: monthLabel(month), count: inquiries.filter((i) => monthKey(i.created_at) === month).length })),
    bySite: countBy(inquiries, (i) => i.source_site || i.source || "unknown", 8),
    byType: countBy(inquiries, (i) => i.type || "unknown"),
    byStatus: countBy(inquiries, (i) => i.status || "unknown"),
    dealsByChannel: [...byChannel.values()].sort((a, b) => b.count - a.count || a.channel.localeCompare(b.channel)),
    campaigns: [...perCampaign.values()].sort((a, b) => b.deals - a.deals || b.inquiries - a.inquiries || a.campaign.localeCompare(b.campaign)),
    unattributed: { inquiries: inquiries.filter((i) => !i.campaign_id).length, deals: live.filter((d) => !d.campaign_id).length },
    // Volumes of work, never of anyone's activity: how many meetings were held
    // and how many touches were logged, by month and by kind.
    meetingsByMonth: months.map((month) => ({ month, label: monthLabel(month), count: liveMeetings.filter((m) => monthKey(m.started_at) === month).length })),
    meetingsInRange: compared(mtgIn(months), mtgIn(prior)),
    meetingsByType: countBy(liveMeetings, (m) => m.meeting_type || "unknown"),
    interactionsByMonth: months.map((month) => ({ month, label: monthLabel(month), count: touches.filter((t) => t.month === month).reduce((a, t) => a + Number(t.n), 0) })),
    interactionsByKind: [...kindTotals.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
      .slice(0, 6),
  };
}

export async function loadDemand(range: Range = DEFAULT_RANGE, now = new Date()): Promise<DemandMetrics> {
  const months = rangeWindows(range, now).months.length;
  const [inqRes, dealsRes, campaigns, mtgRes, touchRes] = await Promise.all([
    selectInquiries("id, created_at, source, source_site, type, status, deal_id, campaign_id").limit(5000),
    dealsForDemand(),
    listCampaignOptions(),
    selectMeetings("started_at, meeting_type, archived_at").limit(5000),
    companyOs.rpc("interactions_by_month", { p_months: months }),
  ]);
  const errors = collectErrors(
    { error: inqRes.error, label: "inquiries" },
    { error: dealsRes.error, label: "deals" },
    { error: mtgRes.error, label: "meetings" },
    { error: touchRes.error, label: "touches" },
  );
  return aggregateDemand((inqRes.data ?? []) as DemandInquiry[], (dealsRes.data ?? []) as DemandDeal[], campaigns, now, {
    range,
    errors,
    meetings: (mtgRes.data ?? []) as DemandMeeting[],
    touches: (touchRes.data ?? []) as TouchRow[],
  });
}

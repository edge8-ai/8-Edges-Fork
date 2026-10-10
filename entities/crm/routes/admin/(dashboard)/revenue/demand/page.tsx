import { requirePermission } from "@/kernel/identity/access-request";
import { Suspense } from "react";
import { SurfaceLink as Link } from "@/kernel/shell/SurfaceLink";
import { PageHead } from "@/kernel/ui/PageHead";
import { ChartCard, DashEmpty, DashErrors, DashSkeleton, StatTile } from "@/kernel/ui/dash/StatTile";
import { HBars } from "@/kernel/ui/dash/HBars";
import { Columns } from "@/kernel/ui/dash/Columns";
import { TrendLine } from "@/kernel/ui/dash/TrendLine";
import { compactUsd } from "@/entities/company-os";
import { loadDemand } from "@/entities/crm/lib/revenue-metrics/demand";
import { loadTargets, periodProgress, targetFor } from "@/entities/crm/lib/revenue-metrics/targets";
import { parseRange, RANGE_LABELS } from "@/entities/crm/lib/revenue-metrics/shared";
import { RevenueTabs } from "../RevenueTabs";

export const metadata = {
  title: "Revenue · Demand",
  description: "Where inquiries arrive from, how many become deals, which channels the deals came through, and what each campaign produced.",
};

type SearchParams = Record<string, string | string[] | undefined>;

// The Demand tab (RH-4, v2). Inquiries, deal sources, campaign attribution,
// and the volume of meetings and logged touches, by month. Volumes of work,
// never of anyone's activity.
export default async function DemandPage(props: { searchParams: Promise<SearchParams> }) {
  await requirePermission("crm.pipeline");
  const searchParams = await props.searchParams;
  const range = parseRange(searchParams.range);
  return (
    <>
      <PageHead eyebrow="Four Offices · Revenue" title="Demand" sub="Inquiries by month and site, deals by channel, campaign attribution, and the volume of meetings and touches behind them." />
      <RevenueTabs range={range} />
      <Suspense fallback={<DashSkeleton cards={6} />}>
        <DemandSection range={range} />
      </Suspense>
    </>
  );
}

async function DemandSection({ range }: { range: ReturnType<typeof parseRange> }) {
  const now = new Date();
  const [m, targets] = await Promise.all([loadDemand(range, now), loadTargets()]);
  const usd = (n: number) => compactUsd(n * 100);
  const periodLabel = RANGE_LABELS[range].toLowerCase();
  const conversion = m.inquiries ? Math.round((100 * m.linkedToDeal) / m.inquiries) : 0;
  const attributed = m.campaigns.reduce((a, c) => a + c.deals, 0);
  const thisMonthMeetings = m.meetingsByMonth[m.meetingsByMonth.length - 1]?.count ?? 0;
  const thisMonthInquiries = m.byMonth[m.byMonth.length - 1]?.count ?? 0;
  const lastTouches = m.interactionsByMonth[m.interactionsByMonth.length - 1]?.count ?? 0;
  const inqTarget = targetFor(targets.rows, "inquiries", "month", now);
  const mtgTarget = targetFor(targets.rows, "meetings", "month", now);
  return (
    <>
      <DashErrors errors={[...m.errors, ...targets.errors]} />
      <div className="dash-grid">
        <StatTile
          label={`Inquiries · ${periodLabel}`}
          value={m.inquiriesInRange.value}
          raw={thisMonthInquiries}
          sub={`${m.inquiries} in total · ${m.archived} archived`}
          delta={{ ...m.inquiriesInRange, priorLabel: `prior ${periodLabel}` }}
          target={inqTarget ? { amount: inqTarget.amount, progress: periodProgress("month", now), label: "monthly target" } : undefined}
          href="/admin/revenue/inquiries"
        />
        <StatTile label="Inquiries linked to a deal" value={m.linkedToDeal} sub={`${conversion}% of all inquiries · linked at hand-off from now on`} href="/admin/revenue/inquiries" />
        <StatTile label="Deals with a campaign" value={attributed} tone={attributed ? undefined : "warn"} sub={`${m.unattributed.deals} live deals not attributed yet`} href="/admin/revenue/deals?focus=no-campaign" />
        <StatTile
          label={`Meetings · ${periodLabel}`}
          value={m.meetingsInRange.value}
          raw={thisMonthMeetings}
          sub={`${lastTouches} touches logged this month`}
          delta={{ ...m.meetingsInRange, priorLabel: `prior ${periodLabel}` }}
          target={mtgTarget ? { amount: mtgTarget.amount, progress: periodProgress("month", now), label: "monthly target" } : undefined}
          href="/admin/revenue/meetings"
        />
      </div>

      <div className="dash-grid">
        <ChartCard title="Inquiries · by month" meta={periodLabel}>
          <Columns labels={m.byMonth.map((p) => p.label)} series={[{ name: "inquiries", values: m.byMonth.map((p) => p.count) }]} emptyText={`No inquiries in the last ${periodLabel}.`} />
        </ChartCard>
        <ChartCard title="Inquiries · by site" meta={`${m.inquiries} total`} note={`Types: ${m.byType.map((t) => `${t.label} ${t.value}`).join(" · ")}.`} more={{ href: "/admin/revenue/inquiries", label: "All inquiries" }}>
          <HBars rows={m.bySite} />
        </ChartCard>
        <ChartCard title="Live deals · by channel" meta="count · value" note={m.dealsByChannel.some((r) => r.channel === "legacy import") ? "Legacy import is the old CRM's name, not a channel; those deals need a real source." : undefined} more={{ href: "/admin/revenue/deals?focus=legacy-import", label: "Deals still sourced legacy import" }}>
          <HBars rows={m.dealsByChannel.map((r) => ({ label: r.channel, value: r.count, extra: r.usd ? usd(r.usd) : undefined, tone: r.channel === "legacy import" || r.channel === "no source" ? "muted" : undefined }))} />
        </ChartCard>
        <ChartCard title="Inquiries · by status" meta="all time">
          <HBars rows={m.byStatus.map((b) => ({ ...b, tone: b.label === "archived" || b.label === "spam" ? "muted" : b.label === "won" ? "ok" : undefined }))} />
        </ChartCard>
        <ChartCard title="Meetings held · by month" meta={m.meetingsByType.map((t) => `${t.label} ${t.value}`).slice(0, 3).join(" · ")} note="Every meeting on the calendar, all types. A volume of work, not of anyone's attendance.">
          <TrendLine labels={m.meetingsByMonth.map((p) => p.label)} values={m.meetingsByMonth.map((p) => p.count)} emptyText={`No meetings in the last ${periodLabel}.`} />
        </ChartCard>
        <ChartCard title="Touches logged · by month" meta={m.interactionsByKind.map((k) => `${k.label} ${k.value}`).slice(0, 3).join(" · ")} note="Aggregated in the database by month and kind. Email dominates because the sync writes one row per message.">
          <TrendLine labels={m.interactionsByMonth.map((p) => p.label)} values={m.interactionsByMonth.map((p) => p.count)} emptyText={`Nothing logged in the last ${periodLabel}.`} />
        </ChartCard>
        <ChartCard
          title="Campaign attribution"
          span={12}
          meta={`${m.campaigns.length} campaigns with results`}
          note={`${m.unattributed.inquiries} inquiries and ${m.unattributed.deals} live deals carry no campaign. Inquiries from a link carrying ?utm_campaign=<slug> are attributed on arrival; deals are set on the deal detail.`}
        >
          {m.campaigns.length === 0 ? (
            <DashEmpty>
              No deal or inquiry is linked to a campaign yet. Give a campaign a UTM slug on its hub and use it in links, or set the campaign on a deal&apos;s detail page. <Link href="/admin/revenue/marketing/campaigns">Open campaigns →</Link>
            </DashEmpty>
          ) : (
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th className="n">Inquiries</th>
                  <th className="n">Deals</th>
                  <th className="n">Won</th>
                  <th className="n">Won value</th>
                </tr>
              </thead>
              <tbody>
                {m.campaigns.map((c) => (
                  <tr key={c.campaign}>
                    <td>{c.campaign}</td>
                    <td className="n">{c.inquiries}</td>
                    <td className="n">{c.deals}</td>
                    <td className="n">{c.won}</td>
                    <td className="n">{usd(c.usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ChartCard>
      </div>
    </>
  );
}

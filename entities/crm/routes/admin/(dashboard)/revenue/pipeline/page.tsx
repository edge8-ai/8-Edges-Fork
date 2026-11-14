import { requirePermission } from "@/kernel/identity/access-request";
import { Suspense } from "react";
import { SurfaceLink as Link } from "@/kernel/shell/SurfaceLink";
import { PageHead } from "@/kernel/ui/PageHead";
import { formatDate } from "@/kernel/ui/format";
import { ChartCard, DashErrors, DashPending, DashSkeleton, StatTile } from "@/kernel/ui/dash/StatTile";
import { HBars } from "@/kernel/ui/dash/HBars";
import { Columns } from "@/kernel/ui/dash/Columns";
import { TrendLine } from "@/kernel/ui/dash/TrendLine";
import { compactUsd } from "@/entities/company-os";
import { loadPipeline } from "@/entities/crm/lib/revenue-metrics/pipeline";
import { loadTargets, periodProgress, targetFor } from "@/entities/crm/lib/revenue-metrics/targets";
import { parseRange, RANGE_LABELS } from "@/entities/crm/lib/revenue-metrics/shared";
import { RevenueTabs } from "../RevenueTabs";

export const metadata = {
  title: "Revenue · Pipeline",
  description: "How much is in flight, where it sits, how it has been closing, how each stage converts, and how long open deals have waited.",
};

type SearchParams = Record<string, string | string[] | undefined>;

// The Pipeline tab (RH-4, v2). Every figure is about deals, stages and
// channels; nothing is sliced by owner, and the metrics module has no owner
// column to slice by. The head and tabs render at once; the figures stream.
export default async function PipelinePage(props: { searchParams: Promise<SearchParams> }) {
  await requirePermission("crm.pipeline");
  const searchParams = await props.searchParams;
  const range = parseRange(searchParams.range);
  return (
    <>
      <PageHead eyebrow="Four Offices · Revenue" title="Pipeline" sub="Open value by stage, closes by month, the expected-close forecast, stage conversion and velocity, and how long open deals have sat where they are." />
      <RevenueTabs range={range} />
      <Suspense fallback={<DashSkeleton cards={6} />}>
        <PipelineSection range={range} />
      </Suspense>
    </>
  );
}

async function PipelineSection({ range }: { range: ReturnType<typeof parseRange> }) {
  const now = new Date();
  const [m, targets] = await Promise.all([loadPipeline(range, now), loadTargets()]);
  const usd = (n: number) => compactUsd(n * 100);
  const missing = m.completeness.noAmount + m.completeness.noExpectedClose + m.completeness.foreignNoUsd;
  const periodLabel = RANGE_LABELS[range].toLowerCase();
  const wonTarget = targetFor(targets.rows, "won_usd", "month", now);
  const thisMonthWon = m.closedByMonth[m.closedByMonth.length - 1]?.wonUsd ?? 0;
  const logDay = m.logSince ? formatDate(m.logSince) : null;
  const historyReady = m.history.length >= 2;
  const flowReady = m.stageFlow.some((s) => s.entered >= 3);
  return (
    <>
      <DashErrors errors={[...m.errors, ...targets.errors]} />
      <div className="dash-grid">
        <StatTile label="Open pipeline" value={usd(m.openUsd)} sub={`${m.open} open deals · ${usd(m.openWeightedUsd)} weighted by probability`} href="/admin/revenue/deals" />
        <StatTile
          label={`Won · ${periodLabel}`}
          value={usd(m.wonUsd.value)}
          raw={thisMonthWon}
          sub={`${m.wonCount.value} won · ${m.lostCount} lost${m.winRate != null ? ` · ${m.winRate}% win rate by count` : ""}`}
          delta={{ ...m.wonUsd, format: "usd", priorLabel: `prior ${periodLabel}` }}
          target={wonTarget ? { amount: wonTarget.amount, format: "usd", progress: periodProgress("month", now), label: "monthly target" } : undefined}
          href="/admin/revenue/deals"
        />
        <StatTile label="Live deals" value={m.live} sub={`${m.archived} archived, out of every figure here`} href="/admin/revenue/deals" />
        <StatTile label="Forecast inputs missing" value={missing} tone={missing ? "warn" : "ok"} sub={`${m.completeness.noAmount} without an amount · ${m.completeness.noExpectedClose} without a close date${m.completeness.foreignNoUsd ? ` · ${m.completeness.foreignNoUsd} without a USD figure` : ""}`} href="/admin/revenue/data-health" />
      </div>

      <div className="dash-grid">
        <ChartCard title="Live deals by stage" meta={`${m.live} deals`} note="Count per stage; the second figure is the stage's total value. Archived deals excluded." download={{ name: "Deals by stage", rows: m.byStage.map((b) => ({ stage: b.stage, deals: b.count, usd: b.usd, weightedUsd: b.weightedUsd })) }}>
          <HBars rows={m.byStage.map((s) => ({ label: s.stage, value: s.count, extra: s.usd ? usd(s.usd) : undefined, tone: s.isWon ? "ok" : s.isLost ? "warn" : undefined }))} />
        </ChartCard>
        <ChartCard title="Won and lost · by close month" meta={periodLabel} download={{ name: "Won and lost by month", rows: m.closedByMonth.map((p) => ({ month: p.month, won: p.won, lost: p.lost, wonUsd: p.wonUsd })) }}>
          <Columns
            labels={m.closedByMonth.map((p) => p.label)}
            series={[
              { name: "won", values: m.closedByMonth.map((p) => p.won), tone: "ok" },
              { name: "lost", values: m.closedByMonth.map((p) => p.lost), tone: "warn" },
            ]}
            emptyText={`No deals closed in the last ${periodLabel}.`}
          />
        </ChartCard>
        <ChartCard
          title="Expected to close · next six months"
          meta="open deals"
          download={{ name: "Expected to close", rows: m.forecastByMonth.map((f) => ({ month: f.month, deals: f.count, usd: f.usd, weightedUsd: f.weightedUsd })) }}
          note={
            <>
              {m.completeness.noExpectedClose} open {m.completeness.noExpectedClose === 1 ? "deal is" : "deals are"} missing here for want of a date.{" "}
              <Link href="/admin/revenue/deals?focus=no-close-date">See which →</Link>
            </>
          }
        >
          <Columns
            labels={m.forecastByMonth.map((p) => p.label)}
            series={[
              { name: "total", values: m.forecastByMonth.map((p) => p.usd) },
              { name: "weighted by probability", values: m.forecastByMonth.map((p) => p.weightedUsd), tone: "warn" },
            ]}
            format="usd"
            emptyText="No open deal carries an expected close date in the next six months."
          />
        </ChartCard>
        <ChartCard title="Won value · by close month" meta={`${usd(m.wonUsd.value)} in ${periodLabel}`} download={{ name: "Won value by month", rows: m.closedByMonth.map((p) => ({ month: p.month, wonUsd: p.wonUsd })) }}>
          <Columns labels={m.closedByMonth.map((p) => p.label)} series={[{ name: "won value", values: m.closedByMonth.map((p) => p.wonUsd), tone: "ok" }]} format="usd" emptyText={`Nothing won in the last ${periodLabel}.`} />
        </ChartCard>

        <ChartCard title="Stage conversion and time in stage" span={8} meta={logDay ? `from the stage log, since ${logDay}` : "no log yet"} note="Of the deals that left each stage, the share that moved forward or won; the median days a deal spent there. From the log, so only moves since it began count." download={{ name: "Stage conversion", rows: m.stageFlow.map((f) => ({ stage: f.stage, entered: f.entered, advanced: f.advanced, won: f.won, lost: f.lost, conversionPct: f.conversion ?? "", medianDays: f.medianDays ?? "" })) }}>
          {!flowReady ? (
            <DashPending since={logDay}>The log has not seen enough stage moves yet to say how stages convert. It fills in as deals move.</DashPending>
          ) : (
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Stage</th>
                  <th className="n">Entered</th>
                  <th className="n">Moved on</th>
                  <th className="n">Lost</th>
                  <th className="n">Conversion</th>
                  <th className="n">Median days</th>
                </tr>
              </thead>
              <tbody>
                {m.stageFlow.map((s) => (
                  <tr key={s.stage}>
                    <td>{s.stage}</td>
                    <td className="n">{s.entered}</td>
                    <td className="n">{s.advanced}</td>
                    <td className="n">{s.lost}</td>
                    <td className="n">{s.conversion == null ? "—" : `${s.conversion}%`}</td>
                    <td className="n">{s.medianDays == null ? "—" : s.medianDays}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ChartCard>
        <ChartCard
          title="Win rate · by channel"
          span={4}
          meta={periodLabel}
          note="Closed deals only, so a channel full of new deals does not read as a losing one."
          download={{ name: "Win rate by channel", rows: m.channelWins.map((c) => ({ channel: c.channel, won: c.won, lost: c.lost, winRatePct: c.winRate ?? "", wonUsd: c.wonUsd })) }}
        >
          <HBars rows={m.channelWins.map((c) => ({ label: c.channel, value: c.winRate ?? 0, extra: `${c.won}/${c.won + c.lost}`, tone: c.channel === "legacy import" ? "muted" : undefined }))} emptyText={`No deals closed in the last ${periodLabel}.`} />
        </ChartCard>
        <ChartCard
          title="Lost deals · by reason"
          span={8}
          meta={`${periodLabel} · ${m.lostCount} lost`}
          note="Every lost deal is meant to carry a reason from the vocabulary the board asks for; one that does not is counted as “no reason given” rather than dropped, so the gap shows. Count first, value beside it. A reason that grows quarter on quarter is the one to talk about."
          download={{ name: "Lost deals by reason", rows: m.lostReasons.map((r) => ({ reason: r.reason, deals: r.count, usd: r.usd })) }}
        >
          <HBars
            rows={m.lostReasons.map((r) => ({ label: r.reason, value: r.count, extra: usd(r.usd), tone: r.reason === "no reason given" ? "muted" : undefined }))}
            emptyText={`No deals were lost in the last ${periodLabel}.`}
          />
        </ChartCard>

        <ChartCard
          title="Open pipeline · over time"
          span={8}
          meta={historyReady ? `${m.history.length} nightly readings` : "nightly snapshots"}
          note="One reading a night at 00:30 UTC. The line is the open value; hover for the weighted figure and the deal count."
          download={{ name: "Open pipeline over time", rows: m.history.map((h) => ({ date: h.date, openUsd: h.openUsd, weightedUsd: h.weightedUsd, openDeals: h.openDeals })) }}
        >
          {!historyReady ? (
            <DashPending since={m.history[0] ? formatDate(m.history[0].date) : null}>The nightly snapshot has {m.history.length === 0 ? "not run yet" : "one reading"}; a line needs two.</DashPending>
          ) : (
            <TrendLine labels={m.history.map((h) => h.label)} values={m.history.map((h) => h.openUsd)} format="usd" />
          )}
        </ChartCard>
        <ChartCard title="Open deals · days in current stage" span={4} meta={logDay ? `log since ${logDay}` : "no log yet"} note="A deal that has not moved since the log began counts from that day, not from when it really entered the stage." download={{ name: "Days in current stage", rows: m.ageInStage.map((b) => ({ bucket: b.label, deals: b.value })) }}>
          {m.logSince && (now.getTime() - new Date(m.logSince).getTime()) / 86_400_000 < 14 ? (
            <DashPending since={logDay}>Every open deal reads as new in its stage because the log started this fortnight. Ages become honest as the log ages.</DashPending>
          ) : (
            <HBars rows={m.ageInStage.map((b, i) => ({ ...b, tone: i >= 2 ? "warn" : undefined }))} />
          )}
        </ChartCard>
        <ChartCard title="Open deals · days since creation" span={4} meta={`${m.open} deals`} note="Age of the deal itself, the honest figure until the stage log has history behind it." download={{ name: "Days since creation", rows: m.ageSinceCreated.map((b) => ({ bucket: b.label, deals: b.value })) }}>
          <HBars rows={m.ageSinceCreated.map((b, i) => ({ ...b, tone: i >= 2 ? "warn" : undefined }))} />
        </ChartCard>
      </div>
    </>
  );
}

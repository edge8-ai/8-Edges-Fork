import { requirePermission } from "@/kernel/identity/access-request";
import { Suspense } from "react";
import { PageHead } from "@/kernel/ui/PageHead";
import { ChartCard, DashEmpty, DashErrors, DashSkeleton, StatTile } from "@/kernel/ui/dash/StatTile";
import { Columns } from "@/kernel/ui/dash/Columns";
import { HBars } from "@/kernel/ui/dash/HBars";
import { RangePicker } from "@/kernel/ui/dash/RangePicker";
import { compactUsd } from "@/entities/company-os";
import { HORIZONS, loadRecurringForecast, parseHorizon, type Horizon } from "@/entities/crm/lib/revenue-metrics/outlook";
import { loadRunway } from "@/entities/crm/lib/revenue-metrics/runway";
import { RevenueTabs } from "../RevenueTabs";

export const metadata = {
  title: "Revenue · Forecast",
  description: "The recurring book rolled forward over a chosen horizon, the cash it brings in against what the last complete months cost, and every assumption the two rest on, printed.",
};

type SearchParams = Record<string, string | string[] | undefined>;

// The Forecast tab (S.8). Two questions, one page:
//
//   what does the recurring book look like in N months, if nothing is sold
//   and only the cancellations we already know about happen; and
//   how long do the receivables cover the burn.
//
// Neither is a model, and the page's job is to make that impossible to
// misread: every assumption behind the two charts is printed on the screen
// beside them, in the words the aggregates themselves produce, so a figure and
// the caveat it needs can never be separated by a screenshot. The tab takes a
// HORIZON rather than the hub's period picker, because both figures look
// forward and the hub's range looks back.
export default async function ForecastPage(props: { searchParams: Promise<SearchParams> }) {
  await requirePermission("crm.pipeline");
  const searchParams = await props.searchParams;
  const horizon = parseHorizon(searchParams.horizon);
  return (
    <>
      <PageHead
        eyebrow="Four Offices · Revenue"
        title="Forecast and runway"
        sub="The recurring book rolled forward, the cash it brings in against what the business costs, and what both figures assume."
      />
      <RevenueTabs showRange={false} />
      <div className="dash-tabrow">
        <span className="dash-card-meta">Horizon</span>
        <RangePicker options={HORIZONS.map((h) => ({ value: String(h), label: `${h} months` }))} current={String(horizon)} param="horizon" ariaLabel="Forecast horizon" />
      </div>
      <Suspense fallback={<DashSkeleton cards={8} />}>
        <ForecastSection horizon={horizon} />
      </Suspense>
    </>
  );
}

async function ForecastSection({ horizon }: { horizon: Horizon }) {
  const now = new Date();
  const [f, r] = await Promise.all([loadRecurringForecast(horizon, now), loadRunway(horizon, now)]);
  const usd = (n: number) => compactUsd(n * 100);
  const window = `${horizon} months`;
  // Under three months of cover is the figure a reader has to act on; the
  // threshold is stated on the tile rather than only being a colour.
  const runwayTight = r.runwayMonths != null && r.runwayMonths < 3;

  return (
    <>
      <DashErrors errors={[...f.errors, ...r.errors]} />
      <div className="dash-grid">
        <StatTile
          label="Recurring · baseline"
          value={usd(f.baseline)}
          sub={f.baselineMonth ? "invoiced as recurring in the last complete month" : "no recurring invoicing to roll forward"}
          tone={f.baselineMonth ? undefined : "warn"}
          href="/admin/revenue/billing"
        />
        <StatTile
          label="Contracted · per month"
          value={usd(f.contractedNow)}
          sub={f.coveragePct == null ? `${f.liveSubscriptions} live subscriptions · nothing invoiced to compare against` : `${f.liveSubscriptions} live subscriptions · ${f.coveragePct}% of the invoiced book`}
        />
        <StatTile label={`Cash in · next ${window}`} value={usd(r.cashInTotal)} sub={`${usd(r.collectible)} owed in total · ${usd(r.burnMonthly)} a month goes out`} href="/admin/revenue/billing" />
        <StatTile
          label="Runway · receivables only"
          value={r.runwayMonths == null ? "—" : `${r.runwayMonths} mo`}
          tone={runwayTight ? "warn" : undefined}
          sub={r.costsIncomplete ? "a cost read failed, so the burn is not known" : r.runwayMonths == null ? "no burn recorded in the last complete months" : "what is owed divided by the burn · no bank balance is counted"}
        />
      </div>

      <div className="dash-grid">
        <ChartCard
          title="Recurring book · rolled forward"
          span={8}
          meta={`${usd(f.total)} over ${window}`}
          note={`The solid line is the invoiced baseline carried forward and reduced by the subscriptions that have already said when they stop; the second is what the live subscription book is worth on its own. Nothing here grows: no new business, no assumed churn.${f.gaps.unpricedSubscriptions + f.gaps.foreignProducts > 0 ? ` ${f.gaps.unpricedSubscriptions + f.gaps.foreignProducts} live subscriptions could not be priced and count as nothing.` : ""}`}
          download={{ name: "Recurring forecast", rows: f.months.map((p) => ({ month: p.month, recurring: p.recurring, contracted: p.contracted, ending: p.ending })) }}
        >
          <Columns
            labels={f.months.map((p) => p.label)}
            series={[
              { name: "recurring, rolled forward", values: f.months.map((p) => p.recurring) },
              { name: "contracted subscriptions", values: f.months.map((p) => p.contracted), tone: "muted" },
            ]}
            format="usd"
            emptyText="Nothing was invoiced as recurring last month and no subscription is live: there is no book to roll forward."
          />
        </ChartCard>

        <ChartCard
          title="Billing for the last time"
          span={4}
          meta={f.endingCount === 0 ? "none in this horizon" : `${f.endingCount} subscriptions`}
          note="A subscription set to cancel at the end of its period bills through that month and not after, so the step down lands the month after the bar."
          download={{ name: "Subscriptions ending", rows: f.months.map((p) => ({ month: p.month, endingUsd: p.ending })) }}
        >
          <HBars rows={f.months.map((p) => ({ label: p.label, value: p.ending, tone: p.ending > 0 ? ("warn" as const) : undefined }))} format="usd" emptyText="No live subscription is set to cancel in this horizon." />
        </ChartCard>

        <ChartCard
          title="Cash in against burn"
          span={8}
          meta={`${usd(r.cashInTotal)} in · ${usd(r.burnTotal)} out`}
          note={`Cash in is what is already invoiced and unpaid, placed in the month it falls due, with everything past due swept into this month. Burn is the average of the last ${r.burnFromMonths.length} complete months, repeated.${r.undatedBalance > 0 ? ` ${usd(r.undatedBalance)} of open balance has no due date and is in no month here.` : ""}`}
          download={{ name: "Cash in and burn", rows: r.months.map((p) => ({ month: p.month, cashIn: p.cashIn, burn: p.burn, net: p.net, cumulative: p.cumulative })) }}
        >
          <Columns
            labels={r.months.map((p) => p.label)}
            series={[
              { name: "cash in", values: r.months.map((p) => p.cashIn), tone: "ok" },
              { name: "burn", values: r.months.map((p) => p.burn), tone: "warn" },
            ]}
            format="usd"
            emptyText="Nothing is owed and nothing was spent: there is no position to draw."
          />
        </ChartCard>

        <ChartCard
          title="Running position"
          span={4}
          meta={r.firstNegativeMonth ? `negative from ${r.months.find((p) => p.month === r.firstNegativeMonth)?.label}` : "positive across the horizon"}
          note="Cash in minus burn, run forward from zero. It starts at zero because no bank balance is recorded anywhere; read it as the change, not the balance."
          download={{ name: "Running position", rows: r.months.map((p) => ({ month: p.month, net: p.net, cumulative: p.cumulative })) }}
        >
          <table className="dash-table">
            <thead>
              <tr>
                <th>Month</th>
                <th className="n">Net</th>
                <th className="n">Running</th>
              </tr>
            </thead>
            <tbody>
              {r.months.map((p) => (
                <tr key={p.month}>
                  <td>{p.label}</td>
                  <td className="n">{usd(p.net)}</td>
                  <td className="n">{usd(p.cumulative)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartCard>

        <ChartCard
          title="What these figures assume"
          span={12}
          meta="printed, not filed"
          note="Every sentence here is produced by the same function that produced the numbers above, so a figure and the caveat it needs cannot drift apart."
        >
          {f.assumptions.length + r.assumptions.length === 0 ? (
            <DashEmpty>Nothing to state.</DashEmpty>
          ) : (
            <ul className="dash-assumptions">
              {f.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
              {r.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>
    </>
  );
}

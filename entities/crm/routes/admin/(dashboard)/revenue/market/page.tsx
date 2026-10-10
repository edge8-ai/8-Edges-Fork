import { requirePermission } from "@/kernel/identity/access-request";
import { Suspense } from "react";
import { SurfaceLink as Link } from "@/kernel/shell/SurfaceLink";
import { PageHead } from "@/kernel/ui/PageHead";
import { formatDate } from "@/kernel/ui/format";
import { ChartCard, DashEmpty, DashErrors, DashSkeleton, StatTile } from "@/kernel/ui/dash/StatTile";
import { HBars } from "@/kernel/ui/dash/HBars";
import { loadMarket } from "@/entities/crm/lib/revenue-metrics/market";
import { parseRange } from "@/entities/crm/lib/revenue-metrics/shared";
import { RevenueTabs } from "../RevenueTabs";

export const metadata = {
  title: "Revenue · Market",
  description: "Who the company base is, by lifecycle, industry, country and size, and what the weekly trend report is saying.",
};

type SearchParams = Record<string, string | string[] | undefined>;

// The Market tab (RH-4). The company base, and the ideas entity's weekly trend
// report, which until now reached only the Innovation cockpit. The base is a
// stock, not a flow, so the period picker does not change it; the tabs keep
// the chosen range so the next tab opens on it.
export default async function MarketPage(props: { searchParams: Promise<SearchParams> }) {
  await requirePermission("crm.pipeline");
  const searchParams = await props.searchParams;
  const range = parseRange(searchParams.range);
  return (
    <>
      <PageHead eyebrow="Four Offices · Revenue" title="Market" sub="The companies we know, and what the trend report across our own ideas is pointing at." />
      <RevenueTabs range={range} />
      <Suspense fallback={<DashSkeleton cards={4} />}>
        <MarketSection />
      </Suspense>
    </>
  );
}

async function MarketSection() {
  const m = await loadMarket();
  const customers = m.byLifecycle.find((b) => b.label === "customer")?.value ?? 0;
  const none = m.byLifecycle.find((b) => b.label === "none")?.value ?? 0;
  const industries = m.byIndustry.filter((b) => b.label !== "unknown").length;
  const dupeRecords = m.duplicates.reduce((a, g) => a + g.ids.length, 0);
  return (
    <>
      <DashErrors errors={m.errors} />
      <div className="dash-grid">
        <StatTile label="Companies" value={m.companies} sub={`${customers} customers · ${Math.round((100 * customers) / Math.max(1, m.companies))}% of the base`} href="/admin/revenue/companies" />
        <StatTile label="No lifecycle stage" value={none} tone={none ? "warn" : "ok"} sub="companies nobody has placed yet" href="/admin/revenue/companies" />
        <StatTile label="Probable duplicates" value={dupeRecords} tone={dupeRecords ? "warn" : "ok"} sub={dupeRecords ? `${m.duplicates.length} names held by more than one record` : "every name is held once"} href="/admin/revenue/data-health" />
        <StatTile label="Trend reports" value={m.trendHistory} sub={m.trend?.generatedAt ? `latest ${formatDate(m.trend.generatedAt)}` : "none generated yet"} href="/admin/innovation" />
      </div>

      <div className="dash-grid">
        <ChartCard title="Companies · by lifecycle" meta={`${m.companies} live`} more={{ href: "/admin/revenue/companies", label: "All companies" }}>
          <HBars rows={m.byLifecycle.map((b) => ({ ...b, tone: b.label === "customer" ? "ok" : b.label === "none" ? "muted" : undefined }))} />
        </ChartCard>
        <ChartCard title="Companies · by industry" meta={`top 8 of ${industries}`}>
          <HBars rows={m.byIndustry.map((b) => ({ ...b, tone: b.label === "unknown" ? "muted" : undefined }))} />
        </ChartCard>
        <ChartCard title="Companies · by country" meta="top 8">
          <HBars rows={m.byCountry.map((b) => ({ ...b, tone: b.label === "unknown" ? "muted" : undefined }))} />
        </ChartCard>
        <ChartCard title="Companies · by size band">
          <HBars rows={m.bySize.map((b) => ({ ...b, tone: b.label === "unknown" ? "muted" : undefined }))} />
        </ChartCard>
        <ChartCard
          title="What the trend report says"
          span={12}
          meta={m.trend?.generatedAt ? `generated ${formatDate(m.trend.generatedAt)} · ${m.trend.sourceCount} ideas` : undefined}
          note={
            <>
              The full history and the ideas behind it are on the <Link href="/admin/innovation">Innovation cockpit</Link>. This is the report a client version would be packaged from.
            </>
          }
        >
          {!m.trend ? (
            <DashEmpty>No trend report yet. The weekly routine writes one every Monday.</DashEmpty>
          ) : (
            <ol className="dash-themes">
              {m.trend.themes.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ol>
          )}
        </ChartCard>
      </div>
    </>
  );
}

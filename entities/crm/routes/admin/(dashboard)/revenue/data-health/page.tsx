import { requirePermission } from "@/kernel/identity/access-request";
import { Suspense } from "react";
import { SurfaceLink as Link } from "@/kernel/shell/SurfaceLink";
import { PageHead } from "@/kernel/ui/PageHead";
import { formatDate } from "@/kernel/ui/format";
import { ChartCard, DashErrors, DashSkeleton, StatTile } from "@/kernel/ui/dash/StatTile";
import { loadPipeline } from "@/entities/crm/lib/revenue-metrics/pipeline";
import { loadDemand } from "@/entities/crm/lib/revenue-metrics/demand";
import { loadBilling } from "@/entities/crm/lib/revenue-metrics/billing";
import { loadMarket } from "@/entities/crm/lib/revenue-metrics/market";
import { loadClients } from "@/entities/crm/lib/revenue-metrics/clients";
import { buildHealthChecks, loadFocusSets } from "@/entities/crm/lib/revenue-metrics/health";
import { parseRange } from "@/entities/crm/lib/revenue-metrics/shared";
import { RevenueTabs } from "../RevenueTabs";

export const metadata = {
  title: "Revenue · Data health",
  description: "What the Revenue charts cannot show yet, as counts with the rows to fix.",
};

type SearchParams = Record<string, string | string[] | undefined>;

// The Data health tab (RH-4, v2): where the ETL becomes visible. Every gap the
// other tabs work around is a count here, and every count opens exactly the
// rows behind it (`?focus=` on the deals page, a filter on invoices). A gap
// of zero stays on the page in green, so the list reads as a checklist.
export default async function DataHealthPage(props: { searchParams: Promise<SearchParams> }) {
  await requirePermission("crm.pipeline");
  const searchParams = await props.searchParams;
  const range = parseRange(searchParams.range);
  return (
    <>
      <PageHead eyebrow="Four Offices · Revenue" title="Data health" sub="What the other tabs cannot show yet, and the rows to fix. Each row is a count of records, never of people." />
      <RevenueTabs range={range} />
      <Suspense fallback={<DashSkeleton cards={2} />}>
        <HealthSection range={range} />
      </Suspense>
    </>
  );
}

async function HealthSection({ range }: { range: ReturnType<typeof parseRange> }) {
  const now = new Date();
  // Five loaders in parallel: the four tabs' figures and the focus sets that
  // put ids behind every count.
  const [p, d, b, m, f, c] = await Promise.all([loadPipeline(range, now), loadDemand(range, now), loadBilling(range, now), loadMarket(), loadFocusSets(now), loadClients(range, now)]);
  const checks = buildHealthChecks(p, d, b, m, f, c);
  const open = checks.filter((g) => g.count > 0 && g.tone !== "info");
  const advisory = checks.filter((g) => g.count > 0 && g.tone === "info");
  const rows = checks.reduce((a, g) => a + g.count, 0);
  const errors = [...new Set([...p.errors, ...d.errors, ...b.errors, ...m.errors, ...f.errors, ...c.errors])];
  return (
    <>
      <DashErrors errors={errors} />
      <div className="dash-grid">
        <StatTile label="Checks with rows to fix" value={open.length} tone={open.length ? "warn" : "ok"} sub={`of ${checks.length} checks · ${advisory.length} more are advisory`} />
        <StatTile label="Rows to fix" value={rows} sub="across every check, some rows in more than one" />
        <StatTile label="Stage log since" value={p.logSince ? formatDate(p.logSince) : "—"} sub="history before that is unknown, not zero" />
        <StatTile label="Nightly snapshots" value={p.history.length} sub={p.history[0] ? `first ${formatDate(p.history[0].date)}` : "none taken yet · runs 00:30 UTC"} href="/admin/revenue/pipeline" />
      </div>

      <div className="dash-grid">
        <ChartCard title="Checklist" span={12} meta={open.length === 0 ? "every check is clear" : `${open.length} open · ${advisory.length} advisory`} note="Warn rows change a figure on another tab; advisory rows are hygiene. A count opens exactly those records.">
          <div>
            {checks.map((g) => (
              <div key={g.key} className="dash-check">
                <div className={`dash-check-count${g.count === 0 ? " is-ok" : g.tone === "info" ? " is-info" : ""}`}>{g.count}</div>
                <div className="dash-check-body">
                  <div className="dash-check-title">{g.label}</div>
                  <div className="dash-check-why">{g.why}</div>
                </div>
                {g.count > 0 && (
                  <Link href={g.href} className="dash-check-link">
                    {g.cta} →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </ChartCard>
        {m.duplicates.length > 0 && (
          <ChartCard title="Companies that look like duplicates" span={12} meta={`${m.duplicates.length} names`} note="Same name once case, punctuation and Ltd/Inc/Pty are dropped. Open both and merge the one with less history into the other.">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="n">Records</th>
                  <th>Open</th>
                </tr>
              </thead>
              <tbody>
                {m.duplicates.slice(0, 20).map((g) => (
                  <tr key={g.name}>
                    <td>{g.name}</td>
                    <td className="n">{g.ids.length}</td>
                    <td>
                      {g.ids.map((id, i) => (
                        <span key={id}>
                          {i > 0 && " · "}
                          <Link href={`/admin/revenue/companies/${id}`}>record {i + 1}</Link>
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ChartCard>
        )}
      </div>
    </>
  );
}

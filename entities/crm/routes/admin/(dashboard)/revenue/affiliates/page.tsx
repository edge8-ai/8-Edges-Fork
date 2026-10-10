import { requirePermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { MetricCard } from "@/kernel/ui/MetricCard";
import { Badge } from "@/kernel/ui/Badge";
import { formatCents } from "@/kernel/ui/format";
import { getAffiliateGroups } from "@/entities/crm/lib/affiliates";
import { AffiliatesShelfProvider, AffiliateShelfRow } from "./AffiliatesShelf";

export const metadata = {
  title: "Affiliates",
  description: "Referral partners, their referred deals, and commission owed.",
};

// Revenue office: affiliate / referral partners, ONE ROW PER PERSON (a person
// may hold several codes). The shelf shows their codes, referred deals pulled
// live from the CRM (deals.affiliate_id or deals.referrer_id), and commissions
// with their redemption status (20% work credit / 10% cash). Small table, so no
// pagination/search — the grouped fetch aggregates everything in one pass.
export default async function AffiliatesPage() {
  await requirePermission("crm.pipeline");
  const groups = await getAffiliateGroups();

  const activeCount = groups.filter((g) => g.active).length;
  const pipeline = groups.reduce((s, g) => s + g.referredOpenPipelineCents, 0);
  // "Converted" = referred revenue that actually paid (the gross basis behind
  // every commission), which stays consistent with Commissions awarded below.
  const converted = groups.reduce((s, g) => s + g.accruedGrossCents, 0);
  const commissionsAwarded = groups.reduce((s, g) => s + g.realizedCents, 0);
  const pending = groups.reduce((s, g) => s + g.pendingCount, 0);

  return (
    <>
      <PageHead
        eyebrow="Revenue"
        title="Affiliates"
        sub={`${groups.length} ${groups.length === 1 ? "affiliate" : "affiliates"}`}
      />

      <div className="admin-kpi-grid u-mb-5">
        <MetricCard label="Pipeline" value={formatCents(pipeline, "usd")} sub="open referred deals" />
        <MetricCard label="Converted" value={formatCents(converted, "usd")} sub="referred revenue that paid" />
        <MetricCard label="Commissions awarded" value={formatCents(commissionsAwarded, "usd")} sub="earned by affiliates" />
        <MetricCard
          label="Active affiliates"
          value={activeCount}
          sub={pending > 0 ? `${pending} commission${pending === 1 ? "" : "s"} pending choice` : `of ${groups.length} affiliate${groups.length === 1 ? "" : "s"}`}
        />
      </div>

      <AffiliatesShelfProvider>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Affiliate</th>
                <th>Codes</th>
                <th className="u-right">Referred deals</th>
                <th className="u-right">Referred pipeline</th>
                <th className="u-right">Unpaid</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 ? (
                <tr>
                  <td colSpan={6} className="admin-cell-muted u-p-5 u-center-text">
                    No affiliates yet.
                  </td>
                </tr>
              ) : (
                groups.map((g) => (
                  <AffiliateShelfRow row={g} key={g.groupKey}>
                    <td>
                      <span className="u-row u-wrap">
                        <span className="admin-cell-strong">{g.name}</span>
                        {g.kind === "company" && <Badge tone="info">Company</Badge>}
                      </span>
                      {g.name !== g.email && g.email && <div className="admin-cell-muted">{g.email}</div>}
                    </td>
                    <td className="admin-cell-mono">
                      {g.codes.filter((c) => c.active).map((c) => c.code).join(", ") || <span className="admin-cell-muted">—</span>}
                    </td>
                    <td className="u-right">{g.referredDealCount || <span className="admin-cell-muted">0</span>}</td>
                    <td className="admin-cell-mono u-right">
                      {g.referredOpenPipelineCents ? formatCents(g.referredOpenPipelineCents, "usd") : <span className="admin-cell-muted">—</span>}
                    </td>
                    <td className="admin-cell-mono u-right">
                      {g.unpaidCents ? formatCents(g.unpaidCents, "usd") : <span className="admin-cell-muted">—</span>}
                    </td>
                    <td>
                      <span className="u-row u-wrap">
                        {g.active ? <Badge tone="ok">Active</Badge> : <Badge tone="neutral">Inactive</Badge>}
                        {g.pendingCount > 0 && <Badge tone="warn">{g.pendingCount} pending</Badge>}
                      </span>
                    </td>
                  </AffiliateShelfRow>
                ))
              )}
            </tbody>
          </table>
        </div>
      </AffiliatesShelfProvider>
    </>
  );
}

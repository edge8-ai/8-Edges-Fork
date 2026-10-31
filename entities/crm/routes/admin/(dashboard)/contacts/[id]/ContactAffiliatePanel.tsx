import { SurfaceLink as Link } from "@/kernel/shell/SurfaceLink";
import { MetricCard } from "@/kernel/ui/MetricCard";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { formatCents, humanize } from "@/kernel/ui/format";
import type { Affiliate360 } from "@/entities/crm/lib/affiliates";
import { ExternalLink } from "@/kernel/ui/ExternalLink";
import { externalHref } from "@/kernel/ui/url";

// Affiliate performance for one contact — shown on the contact 360 when the
// person holds an affiliate code. Surfaces the money Dave asked for: pipeline
// generated, referred revenue that paid, and commissions earned, plus the
// referred deals (their proposals) and any commission lines.
export function ContactAffiliatePanel({ affiliate }: { affiliate: Affiliate360 }) {
  const activeCode = affiliate.codes.find((c) => c.active)?.code ?? affiliate.codes[0]?.code ?? null;
  const pipelineCents = affiliate.referredDeals
    .filter((d) => (d.status || "").toLowerCase() === "open")
    .reduce((s, d) => s + (d.amountCents ?? 0), 0);

  return (
    <div className="admin-card admin-section-card">
      <div className="u-row u-between u-mb-3">
        <h2 className="admin-card-title">Affiliate</h2>
        <span className="u-row">
          {activeCode && <Badge tone="ok">{activeCode}</Badge>}
          <Link href="/admin/revenue/affiliates" className="admin-cell-muted u-sm">
            Program ↗
          </Link>
        </span>
      </div>

      <div className={`admin-kpi-grid${affiliate.referredDeals.length || affiliate.commissions.length ? " u-mb-4" : ""}`}>
        <MetricCard label="Pipeline" value={formatCents(pipelineCents, "usd")} sub="open referrals" />
        <MetricCard label="Converted" value={formatCents(affiliate.accruedGrossCents, "usd")} sub="referred revenue paid" />
        <MetricCard
          label="Commissions"
          value={formatCents(affiliate.realizedCents, "usd")}
          sub={affiliate.unpaidCents > 0 ? `${formatCents(affiliate.unpaidCents, "usd")} unpaid` : "awarded"}
        />
      </div>

      {affiliate.referredDeals.length > 0 && (
        <>
          <div className="admin-shelf-heading u-mb-2">Referrals &amp; proposals</div>
          <div className="admin-list">
            {affiliate.referredDeals.map((d) => (
              <div className="admin-list-row" key={d.id}>
                <div className="admin-list-main">
                  <div className="admin-list-title">{d.companyName || d.title || "Referral"}</div>
                  <div className="admin-list-sub">
                    {d.title && d.companyName ? d.title : d.via === "code" ? "via code" : "direct referral"}
                    {externalHref(d.proposalUrl) && (
                      <>
                        {" · "}
                        <ExternalLink href={d.proposalUrl}>Proposal ↗</ExternalLink>
                      </>
                    )}
                  </div>
                </div>
                <div className="admin-list-aside">
                  <Badge tone={statusTone(d.status)}>{humanize(d.status) || "Open"}</Badge>
                  {d.amountCents != null && <span className="admin-cell-mono">{formatCents(d.amountCents, d.currency)}</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {affiliate.commissions.length > 0 && (
        <>
          <div className="admin-shelf-heading u-m-0 u-mt-4 u-mb-2">Commissions</div>
          <div className="admin-list">
            {affiliate.commissions.map((c) => (
              <div className="admin-list-row" key={c.id}>
                <div className="admin-list-main">
                  <div className="admin-list-title">
                    {formatCents(c.grossCents, "usd")} <span className="admin-cell-muted">gross</span>
                  </div>
                  <div className="admin-list-sub">{c.sourceRef ? `${humanize(c.sourceEvent)} · ${c.sourceRef}` : humanize(c.sourceEvent)}</div>
                </div>
                <div className="admin-list-aside">
                  {c.redemptionChoice ? (
                    <Badge tone={c.paidOut ? "ok" : "neutral"}>
                      {c.redemptionChoice === "work_credit" ? "Work credit" : "Cash"}
                      {c.commissionCents != null ? ` · ${formatCents(c.commissionCents, "usd")}` : ""}
                      {c.settledAs === "work_credit" ? " · applied" : c.paidOut ? " · paid" : ""}
                    </Badge>
                  ) : (
                    <Badge tone="warn">Pending</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

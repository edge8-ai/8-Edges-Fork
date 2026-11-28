import { requirePortalPermission } from "@/kernel/identity/access-request";
import { getReferralsForActor } from "@/entities/portal/lib/referrals";
import { PageHead } from "@/kernel/ui/PageHead";
import { MetricCard } from "@/kernel/ui/MetricCard";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { formatCents, humanize } from "@/kernel/ui/format";
import { Redeem } from "./Redeem";
import { OPS_EMAIL } from "@/kernel/config/contacts";

// Client-facing referral / commission ledger. The affiliate sees their code,
// who they've referred, and each commission — with the choice to take it as
// 20% work credit or 10% cash. Every figure is scoped to their own person id in
// entities/portal/lib/referrals.ts. Non-affiliates (no code, no history) get a pitch +
// contact CTA instead of an empty ledger; codes are issued by Edge8 on request.
export default async function PortalReferralsPage() {
  const actor = await requirePortalPermission("surface.portal");
  const data = await getReferralsForActor(actor);

  const isAffiliate =
    data.code !== null || data.commissions.length > 0 || data.referredDeals.length > 0;

  if (!isAffiliate) {
    return (
      <>
        <PageHead eyebrow="Client Portal" title="Referrals" sub="Earn credit or cash for the people you send us." />

        <div className="admin-card admin-section-card u-mb-4">
          <h2 className="admin-card-title u-mb-3">How it works</h2>
          <p className="admin-page-sub u-m-0">
            Know a company that could use Edge8? Refer them, and when their first engagement pays, you choose
            how to take your commission: <strong>20% as work credit</strong> toward your own Edge8 work, or{" "}
            <strong>10% as cash</strong>. You&apos;ll get a personal referral code and track everything right here.
          </p>
          <div className="u-mt-4">
            <a
              className="admin-btn admin-btn--primary"
              href={`mailto:${OPS_EMAIL}?subject=Referral%20program%20sign-up`}
            >
              Contact us to sign up
            </a>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead
        eyebrow="Client Portal"
        title="Referrals"
        sub={data.code ? `Your referral code: ${data.code}` : "Your referral activity"}
      />

      <div className="admin-card admin-section-card u-mb-4">
        <p className="admin-page-sub u-m-0">
          Thanks for referring people to Edge8. For each referral that pays, you choose how to take your
          commission: <strong>20% as work credit</strong> toward your own Edge8 work, or <strong>10% as cash</strong>.
        </p>
      </div>

      <div className="admin-kpi-grid u-mb-5">
        <MetricCard label="Work credit" value={formatCents(data.workCreditTotalCents, "usd")} sub="chosen as credit" />
        <MetricCard label="Cash" value={formatCents(data.cashTotalCents, "usd")} sub="chosen as cash" />
        <MetricCard label="Awaiting payment" value={formatCents(data.unpaidCents, "usd")} sub="redeemed, not yet paid or applied" />
        <MetricCard label="Awaiting your choice" value={data.pendingCount} sub="commissions to redeem" />
      </div>

      <div className="admin-card admin-section-card u-mb-4">
        <h2 className="admin-card-title u-mb-3">Commissions</h2>
        {data.commissions.length === 0 ? (
          <div className="admin-empty">No commissions yet. When a referral pays, it shows up here.</div>
        ) : (
          <div className="admin-list">
            {data.commissions.map((c) => (
              <div className="admin-list-row" key={c.id}>
                <div className="admin-list-main">
                  <div className="admin-list-title">
                    {formatCents(c.grossCents, "usd")} <span className="admin-cell-muted">referral value</span>
                  </div>
                  <div className="admin-list-sub">
                    {c.sourceLabel}
                    {c.redemptionChoice && c.commissionCents != null && (
                      <>
                        {" · "}
                        <strong>
                          {c.redemptionChoice === "work_credit" ? "Work credit" : "Cash"} {formatCents(c.commissionCents, "usd")}
                        </strong>
                        {c.settledAs === "work_credit" ? " · applied as Human Tokens" : c.paidOut ? " · paid" : " · awaiting payment"}
                      </>
                    )}
                  </div>
                </div>
                <div className="admin-list-aside u-items-end">
                  {c.paidOut && <Badge tone="ok">{c.settledAs === "work_credit" ? "Applied" : "Paid"}</Badge>}
                  {!c.paidOut && c.redemptionChoice && (
                    <Badge tone="neutral">{c.redemptionChoice === "work_credit" ? "Work credit 20%" : "Cash 10%"}</Badge>
                  )}
                  {!c.paidOut && !c.redemptionChoice && <Badge tone="warn">Choose below</Badge>}
                  <Redeem
                    commissionId={c.id}
                    choice={c.redemptionChoice}
                    workCreditCents={c.workCreditCents}
                    cashCents={c.cashCents}
                    paidOut={c.paidOut}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="admin-card admin-section-card">
        <h2 className="admin-card-title u-mb-3">People you&apos;ve referred</h2>
        {data.referredDeals.length === 0 ? (
          <div className="admin-empty">No referrals tracked yet.</div>
        ) : (
          <div className="admin-list">
            {data.referredDeals.map((d) => (
              <div className="admin-list-row" key={d.id}>
                <div className="admin-list-main">
                  <div className="admin-list-title">{d.companyName || d.title || "Referral"}</div>
                </div>
                <div className="admin-list-aside">
                  <Badge tone={statusTone(d.status)}>{humanize(d.status) || "In progress"}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

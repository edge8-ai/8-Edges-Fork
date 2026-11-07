import { SurfaceLink as Link } from "@/kernel/shell/SurfaceLink";
import { Badge } from "@/kernel/ui/Badge";
import { formatCents } from "@/kernel/ui/format";
import type { Company360 } from "@/entities/crm/lib/companies";

// Referral and affiliate standing on the company Details tab: the company's
// own affiliate code and earnings, and which of its contacts are affiliates.
// Moved out of the page unchanged to keep the page under its size cap.
export function CompanyAffiliateCard({
  companyAffiliate,
  affiliateContacts,
}: {
  companyAffiliate: Company360["affiliate"];
  affiliateContacts: Company360["people"];
}) {
  return (
    <div className="admin-card admin-section-card">
      <h2 className="admin-card-title">Referral &amp; affiliates</h2>
      <div className="u-stack u-gap-4">
        {companyAffiliate?.active && (
          <div>
            <div className="admin-cell-muted u-mb-1 u-sm">This company is an affiliate</div>
            <div className="u-row u-wrap">
              {companyAffiliate.code && <Badge tone="ok">{companyAffiliate.code}</Badge>}
              <span className="admin-cell-strong">{formatCents(companyAffiliate.realizedCents, "usd")} earned</span>
              {companyAffiliate.unpaidCents > 0 && (
                <span className="admin-cell-muted">· {formatCents(companyAffiliate.unpaidCents, "usd")} unpaid</span>
              )}
            </div>
          </div>
        )}
        {affiliateContacts.length > 0 && (
          <div>
            <div className="admin-cell-muted u-mb-1 u-sm">Affiliate contacts</div>
            <div className="u-row u-wrap">
              {affiliateContacts.map((p) => (
                <Link key={p.id} href={`/admin/contacts/${p.id}`} className="u-row">
                  {p.name}
                  {p.affiliateCode && <Badge tone="ok">{p.affiliateCode}</Badge>}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

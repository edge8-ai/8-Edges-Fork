import { formatDate } from "@/kernel/ui/format";
import type { TabDef } from "@/kernel/ui/Tabs";
import { ExternalLink } from "@/kernel/ui/ExternalLink";

type DealLike = { id: string; title: string | null; proposal_url: string | null; created_at: string };

// The Client Hub's Proposals tab: every deal on the company that carries a
// proposal link, newest first (deals arrive ordered by created_at desc).
export function proposalsTab(deals: DealLike[]): TabDef {
  const proposals = deals.filter((d) => !!d.proposal_url);
  return {
    key: "proposals",
    label: "Proposals",
    count: proposals.length,
    content: (
      <section className="admin-card admin-section-card">
        {proposals.length === 0 ? (
          <div className="admin-empty">No proposals on this company&apos;s deals yet.</div>
        ) : (
          <div className="admin-list">
            {proposals.map((d) => (
              <div className="admin-list-row" key={d.id}>
                <div className="admin-list-main">
                  <div className="admin-list-title">{d.title || "Proposal"}</div>
                  <div className="admin-list-sub">{formatDate(d.created_at)}</div>
                </div>
                <div className="admin-list-aside">
                  <ExternalLink className="admin-btn admin-btn--sm" href={d.proposal_url as string}>
                    Open proposal
                  </ExternalLink>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    ),
  };
}

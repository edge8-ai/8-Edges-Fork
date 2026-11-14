// Client Hubs' cards (AH.6): one per active client, the ones that need the
// reader first, each with its status, its work, the money and the last
// meeting, and one next thing to do. Every word comes from
// lib/client-portfolio.ts; this file only draws.
import Link from "next/link";
import { Badge } from "@/kernel/ui/Badge";
import type { PortfolioCard, PortfolioStatus } from "@/entities/company-os/lib/client-portfolio";

const STATUS: Record<PortfolioStatus, { text: string; tone: "err" | "neutral" | "ok" }> = {
  needs: { text: "Needs you", tone: "err" },
  quiet: { text: "Quiet", tone: "neutral" },
  ok: { text: "On track", tone: "ok" },
};

export function ClientPortfolio({ cards }: { cards: PortfolioCard[] }) {
  if (cards.length === 0) return <p className="admin-home-quiet">No client matches.</p>;
  return (
    <div className="hub-grid">
      {cards.map((c) => (
        <article key={c.id} className={`admin-card hub-card hub-card--${c.status}`}>
          <div className="hub-card-head">
            <Link href={c.href} className="hub-card-name">
              {c.name}
            </Link>
            <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].text}</Badge>
          </div>
          <span className="admin-list-sub">{c.sub}</span>
          {c.open + c.late + c.blocked > 0 && (
            <dl className="hub-stats">
              <div>
                <dt>open</dt>
                <dd>{c.open}</dd>
              </div>
              <div className={c.late ? "is-bad" : undefined}>
                <dt>late</dt>
                <dd>{c.late}</dd>
              </div>
              <div className={c.blocked ? "is-bad" : undefined}>
                <dt>blocked</dt>
                <dd>{c.blocked}</dd>
              </div>
            </dl>
          )}
          {c.facts.map((f) => (
            <span key={f} className="admin-list-sub">
              {f}
            </span>
          ))}
          <div className="hub-next">
            {c.next.href ? (
              <Link href={c.next.href} className="admin-auth-link">
                {c.next.label} →
              </Link>
            ) : (
              <span className="admin-cell-muted">{c.next.label}</span>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

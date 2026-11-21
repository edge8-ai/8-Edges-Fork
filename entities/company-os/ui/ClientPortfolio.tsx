// Client Hubs' cards (AH.6): one per active client, the ones that need the
// reader first, each with its status, the reasons for it (AH.7.2), the open
// work and the last meeting, and one next thing to do. Every word comes from
// lib/client-portfolio.ts; this file only draws.
import Link from "next/link";
import { Badge } from "@/kernel/ui/Badge";
import type { PortfolioCard, PortfolioStatus } from "@/entities/company-os/lib/client-portfolio";
import { ClearBlockerButton, type ClearBlocker } from "@/entities/company-os/ui/ClearBlockerButton";

const STATUS: Record<PortfolioStatus, { text: string; tone: "err" | "warn" | "neutral" | "ok" }> = {
  needs: { text: "Needs you", tone: "err" },
  risk: { text: "At risk", tone: "warn" },
  quiet: { text: "Quiet", tone: "neutral" },
  ok: { text: "On track", tone: "ok" },
};

export function ClientPortfolio({ cards, clearBlocker }: { cards: PortfolioCard[]; clearBlocker: ClearBlocker }) {
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
          {c.reasons.length > 0 && (
            <ul className="hub-reasons">
              {c.reasons.map((r) => (
                <li key={r.text} className={`hub-reason hub-reason--${r.level}`}>
                  {r.text}
                  {r.clear && <ClearBlockerButton blockerId={r.clear.blockerId} boardSlug={r.clear.boardSlug} clear={clearBlocker} />}
                </li>
              ))}
            </ul>
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

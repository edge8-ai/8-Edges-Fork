import Link from "next/link";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { MetricCard } from "@/kernel/ui/MetricCard";
import { formatDate, formatHours, humanize } from "@/kernel/ui/format";

// One AI Program as a wide "delivery" card: the three delivery tiles, then the
// Now items and the cards shipped this week. Shared verbatim by the client
// portal home and the team client view so the two surfaces render identically;
// each surface maps its own program summary and hrefs onto these props. The
// delivered figure is branded "Human Tokens Tracked", never hours.

const CARD_LINES = 3;
const WEEK_DAYS = 7;

export type DeliveryNowItem = { id: string; title: string };
export type DeliveryShippedCard = { id: string; title: string; completedAt: string | null };

export type ProgramDeliveryCardProps = {
  name: string;
  status: string;
  roadmapDone: number;
  roadmapTotal: number;
  hasRepo: boolean;
  deliveredHours: number;
  prsMergedLast7d: number;
  now: DeliveryNowItem[];
  shipped: DeliveryShippedCard[];
  href: string; // the program page
  roadmapHref: string; // the program page, roadmap tab
  boardHref: string; // the program page, boards tab
};

export function ProgramDeliveryCard(p: ProgramDeliveryCardProps) {
  const pct = p.roadmapTotal > 0 ? Math.round((p.roadmapDone / p.roadmapTotal) * 100) : 0;
  return (
    <div className="admin-card admin-section-card u-mb-4">
      <div className="admin-card-head">
        <h2 className="admin-card-title">
          <Link href={p.href} className="u-link-plain">{p.name}</Link>
          <span className="u-ml-2"><Badge tone={statusTone(p.status)}>{humanize(p.status)}</Badge></span>
        </h2>
        <Link href={p.href} className="admin-cell-muted u-sm">Open →</Link>
      </div>

      <div className="admin-kpi-grid u-mb-4">
        <MetricCard
          label="Roadmap"
          value={p.roadmapTotal > 0 ? `${p.roadmapDone} / ${p.roadmapTotal}` : "None yet"}
          sub={p.roadmapTotal > 0 ? `${pct}% shipped` : "Edge8 adds items"}
        />
        <MetricCard
          label="Delivered"
          value={p.hasRepo ? formatHours(p.deliveredHours) : "Not tracked"}
          sub={p.hasRepo ? "Human Tokens Tracked" : "no delivery tracking yet"}
        />
        <MetricCard
          label="Updates"
          value={p.hasRepo ? p.prsMergedLast7d : "Not tracked"}
          sub={p.hasRepo ? "merged this week" : "no delivery tracking yet"}
        />
      </div>

      <div className="u-grid-auto-md">
        <div>
          <div className="admin-eyebrow u-mb-1">Now</div>
          {p.now.length === 0 ? (
            <div className="admin-cell-muted u-sm">Nothing marked Now.</div>
          ) : (
            <div className="admin-list">
              {p.now.slice(0, CARD_LINES).map((i) => (
                <Link key={i.id} href={p.roadmapHref} className="admin-list-row u-link-plain">
                  <div className="admin-list-main">
                    <div className="admin-list-title">{i.title}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
          {p.now.length > CARD_LINES && (
            <div className="admin-cell-muted u-sm u-mt-2">
              <Link href={p.roadmapHref}>+ {p.now.length - CARD_LINES} more on the roadmap</Link>
            </div>
          )}
        </div>
        <div>
          <div className="admin-eyebrow u-mb-1">Shipped this week</div>
          {p.shipped.length === 0 ? (
            <div className="admin-cell-muted u-sm">No cards moved to Done in the last {WEEK_DAYS} days.</div>
          ) : (
            <div className="admin-list">
              {p.shipped.slice(0, CARD_LINES).map((c) => (
                <Link key={c.id} href={p.boardHref} className="admin-list-row u-link-plain">
                  <div className="admin-list-main">
                    <div className="admin-list-title">{c.title}</div>
                    {c.completedAt && <div className="admin-list-sub">Done {formatDate(c.completedAt)}</div>}
                  </div>
                </Link>
              ))}
            </div>
          )}
          {p.shipped.length > CARD_LINES && (
            <div className="admin-cell-muted u-sm u-mt-2">
              <Link href={p.boardHref}>+ {p.shipped.length - CARD_LINES} more on the board</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

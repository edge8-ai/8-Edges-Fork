import { DashEmpty } from "./StatTile";
import { formatValue, type ValueFormat } from "./ticks";

export type HBarRow = { label: string; value: number; extra?: string; tone?: "ok" | "warn" | "muted" };

// Horizontal bars, one row per item: label, a mark, the value with an optional
// second figure beside it. The mark is an SVG stretched to the row's width
// (viewBox 0..100, preserveAspectRatio none) so it stays crisp at any card
// size while the text stays HTML at the page's own size. Server-renderable.
export function HBars({
  rows,
  format,
  emptyText = "No data yet.",
  showTrack = false,
}: {
  rows: HBarRow[];
  format?: ValueFormat;
  emptyText?: string;
  showTrack?: boolean;
}) {
  const fmt = (n: number) => formatValue(format ?? "count", n);
  const max = Math.max(0, ...rows.map((r) => r.value));
  if (max <= 0) return <DashEmpty>{emptyText}</DashEmpty>;
  return (
    <div className="dash-hbars">
      {rows.map((r) => {
        const w = Math.max(r.value > 0 ? 0.8 : 0, (100 * r.value) / max);
        return (
          <div key={r.label} className={`dash-hbar${r.tone ? ` is-${r.tone}` : ""}`} title={`${r.label}: ${fmt(r.value)}${r.extra ? ` · ${r.extra}` : ""}`}>
            <span className="dash-hbar-label">{r.label}</span>
            <svg className="dash-hbar-mark" viewBox="0 0 100 14" preserveAspectRatio="none" aria-hidden>
              {showTrack && <rect className="dash-hbar-track" x="0" y="0" width="100" height="14" />}
              <rect x="0" y="0" width={w} height="14" />
            </svg>
            <span className="dash-hbar-value">
              {fmt(r.value)}
              {r.extra && <small>{r.extra}</small>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

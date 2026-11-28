"use client";

import { useState, type ReactNode } from "react";
import { DashEmpty } from "./StatTile";
import { formatValue, niceCeil, Ticks, type ValueFormat } from "./ticks";

export type ColumnSeries = { name: string; values: number[]; tone?: "accent" | "ok" | "warn" | "muted" };

// Grouped columns over a period axis (months, weeks). Gridlines are one SVG
// stretched over the plot; tick labels sit in a fixed-width, unstretched SVG
// beside it; each period is an equal flex slice holding one stretched SVG per
// series, so nothing here needs an inline style. Hovering a period shows every
// series' value for it. Legend appears with two or more series.
//
// `stacked` puts the series on top of each other within one period instead of
// side by side, for the case where the series are parts of one quantity rather
// than rivals — the 90-day cash forecast stacks what is due, what recurs and
// what is expected to close, and the height of the column is the month's cash.
// The axis then tops out at the largest period TOTAL, not the largest single
// value, or the tallest column would run past the top gridline.
export function Columns({
  labels,
  series,
  format,
  emptyText = "No data yet.",
  stacked = false,
}: {
  labels: string[];
  series: ColumnSeries[];
  format?: ValueFormat;
  emptyText?: string;
  stacked?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const kind: ValueFormat = format ?? "count";
  const fmt = (n: number) => formatValue(kind, n);
  // The raw sum, matching the per-series lines the tooltip prints. Clamping
  // here while printing raw values above would show a total that does not add
  // up: a month with a negative segment would list -$5k and then claim a total
  // $5k higher than its own lines.
  const totalAt = (i: number) => series.reduce((a, s) => a + (s.values[i] ?? 0), 0);
  // What the stack can actually draw: a negative part has no height, so the
  // axis is sized on the positive parts only. The two differ only when a
  // series carries a negative value, in which case the column is drawn taller
  // than the total it reports — correct for both (nothing can overflow the
  // plot, and the tooltip adds up), but a caller stacking series that can go
  // negative should read the tooltip, not the height.
  const drawnTotalAt = (i: number) => series.reduce((a, s) => a + Math.max(0, s.values[i] ?? 0), 0);
  const max = stacked
    ? Math.max(0, ...labels.map((_, i) => drawnTotalAt(i)))
    : Math.max(0, ...series.flatMap((s) => s.values));
  if (max <= 0) return <DashEmpty>{emptyText}</DashEmpty>;
  const top = niceCeil(max);
  const dense = labels.length > 8;
  return (
    <div className="dash-cols">
      <div className="dash-cols-row">
        <Ticks top={top} format={kind} />
        <div className="dash-cols-plot">
          <svg className="dash-cols-grid" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            {[25, 50, 75].map((p) => (
              <line key={p} x1="0" x2="100" y1={p} y2={p} />
            ))}
          </svg>
          <div className="dash-cols-groups" onMouseLeave={() => setHover(null)}>
            {labels.map((lab, i) => (
              <div key={lab + i} className="dash-cols-group" onMouseEnter={() => setHover(i)}>
                {stacked ? (
                  <svg className="dash-col dash-col-stack" viewBox="0 0 10 100" preserveAspectRatio="none" aria-label={`${lab}: ${series.map((s) => `${s.name} ${fmt(s.values[i] ?? 0)}`).join(", ")}; total ${fmt(totalAt(i))}`}>
                    {series.reduce<{ y: number; rects: ReactNode[] }>(
                      (acc, s) => {
                        // A negative value contributes nothing and moves nothing:
                        // a stack of parts cannot have a part below the floor.
                        const h = Math.max(0, (100 * Math.max(0, s.values[i] ?? 0)) / top);
                        acc.rects.push(<rect key={s.name} className={s.tone && s.tone !== "accent" ? `is-${s.tone}` : undefined} x="0" y={acc.y - h} width="10" height={h} />);
                        return { y: acc.y - h, rects: acc.rects };
                      },
                      { y: 100, rects: [] },
                    ).rects}
                  </svg>
                ) : (
                  series.map((s) => {
                    const v = s.values[i] ?? 0;
                    // A negative value (a credit month) draws as an empty column, never an
                    // invalid rect with a negative height.
                    const h = Math.max(0, (100 * v) / top);
                    return (
                      <svg key={s.name} className={`dash-col${s.tone && s.tone !== "accent" ? ` is-${s.tone}` : ""}`} viewBox="0 0 10 100" preserveAspectRatio="none" aria-label={`${lab} ${s.name} ${fmt(v)}`}>
                        <rect x="0" y={100 - h} width="10" height={h} />
                      </svg>
                    );
                  })
                )}
                {hover === i && (
                  <div className="dash-tip" role="tooltip">
                    <b>{lab}</b>
                    {series.map((s) => (
                      <div key={s.name}>
                        {s.name}: {fmt(s.values[i] ?? 0)}
                      </div>
                    ))}
                    {stacked && series.length > 1 && <div className="dash-tip-total">total: {fmt(totalAt(i))}</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="dash-cols-axis" aria-hidden>
        {labels.map((lab, i) => (
          <span key={lab + i}>{dense && i % 2 === 1 ? "" : lab}</span>
        ))}
      </div>
      {series.length > 1 && (
        <div className="dash-legend">
          {series.map((s) => (
            <span key={s.name} className={s.tone && s.tone !== "accent" ? `is-${s.tone}` : undefined}>
              <i aria-hidden />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

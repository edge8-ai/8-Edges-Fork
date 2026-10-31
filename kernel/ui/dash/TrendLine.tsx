"use client";

import { useState } from "react";
import { DashEmpty } from "./StatTile";
import { formatValue, niceCeil, Ticks, type ValueFormat } from "./ticks";

// A single-series trend over a period axis: an area-filled line drawn in a
// 0..100 box and stretched to the card, an equal flex hit-zone per period for
// the hover value, ticks in an unstretched SVG beside the plot. One series, so
// no legend; the card title names it and the last value sits in the card meta.
export function TrendLine({
  labels,
  values,
  format,
  emptyText = "No data yet.",
}: {
  labels: string[];
  values: number[];
  format?: ValueFormat;
  emptyText?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const kind: ValueFormat = format ?? "count";
  const fmt = (n: number) => formatValue(kind, n);
  const max = Math.max(0, ...values);
  if (max <= 0) return <DashEmpty>{emptyText}</DashEmpty>;
  const top = niceCeil(max);
  const n = values.length;
  // Points sit at the centre of their flex slice, so the hit-zones line up.
  const x = (i: number) => (100 * (i + 0.5)) / n;
  const y = (v: number) => 100 - (100 * v) / top;
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i)} ${y(v)}`).join(" ");
  const area = `${d} L${x(n - 1)} 100 L${x(0)} 100 Z`;
  const dense = n > 8;
  return (
    <div className="dash-cols">
      <div className="dash-cols-row">
        <Ticks top={top} format={kind} height={160} />
        <div className="dash-line">
          <svg className="dash-cols-grid" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            {[25, 50, 75].map((p) => (
              <line key={p} x1="0" x2="100" y1={p} y2={p} />
            ))}
            <path className="dash-line-area" d={area} />
            <path className="dash-line-path" d={d} />
          </svg>
          <div className="dash-line-hits" onMouseLeave={() => setHover(null)}>
            {values.map((v, i) => (
              <div key={i} className={`dash-line-hit${hover === i ? " is-hover" : ""}`} onMouseEnter={() => setHover(i)}>
                <svg className="dash-line-dotcol" viewBox="0 0 10 100" preserveAspectRatio="none" aria-hidden>
                  <line x1="5" x2="5" y1={y(v)} y2="100" />
                </svg>
                {hover === i && (
                  <div className="dash-tip" role="tooltip">
                    <b>{labels[i]}</b> {fmt(v)}
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
    </div>
  );
}

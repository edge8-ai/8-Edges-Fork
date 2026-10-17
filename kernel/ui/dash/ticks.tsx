// The axis top: the smallest of 1, 2, 2.5, 5 × 10^k at or above the max, so
// gridlines land on round numbers.
export function niceCeil(n: number): number {
  // Small counts get an axis top divisible by four, so the quarter ticks are
  // whole numbers (a chart of 5 closes must not label a tick "1.25").
  if (n <= 20) return Math.max(4, Math.ceil(n / 4) * 4);
  const p = Math.pow(10, Math.floor(Math.log10(n)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= n) return m * p;
  return 10 * p;
}

export const PLOT_H = 180;

// How a chart formats its numbers. A server page hands a client chart a NAME,
// never a function: React refuses functions across the server/client boundary
// at request time, which the static render harness cannot see. "usd" takes
// whole dollars and matches compactUsd's compaction; "count" is a plain number.
export type ValueFormat = "count" | "usd";
export function formatValue(kind: ValueFormat, n: number): string {
  if (kind === "usd") {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
    if (n >= 100_000) return `$${Math.round(n / 1000)}k`;
    if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
    return `$${Math.round(n)}`;
  }
  return n.toLocaleString("en-US");
}

// Tick labels for a plot of PLOT_H pixels: an unstretched SVG of exactly that
// height, so text renders 1:1 and lands on the gridlines of the stretched
// plot beside it (25, 50, 75 and 100 percent of the axis top).
export function Ticks({ top, format, height = PLOT_H }: { top: number; format: ValueFormat; height?: number }) {
  return (
    <svg className="dash-ticks" width="44" height={height} viewBox={`0 0 44 ${height}`} aria-hidden>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <text key={f} x="38" y={Math.max(10, height - f * height + 4)} textAnchor="end">
          {formatValue(format, Math.round(f * top))}
        </text>
      ))}
    </svg>
  );
}

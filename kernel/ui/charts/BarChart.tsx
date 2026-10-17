// Dependency-free server-rendered horizontal bar chart. Single measure, single
// series: every bar wears the accent, values are direct-labeled, no legend.

const ROW_H = 30;
const LABEL_W = 90;
const CHART_W = 320;
const BAR_MAX = CHART_W - LABEL_W - 40;
// Longest label that fits the 90px inline column at 12px before running under
// the bars; longer labels are cut to this and ellipsized.
const LABEL_MAX_CHARS = 13;

// Stacked variant: each label sits on its own line above a full-width bar, for
// long labels (e.g. page paths) that would collide with the bars in the inline
// layout. A wider, landscape viewBox keeps a full-row chart from rendering tall.
const STACK_ROW_H = 38;
const STACK_CHART_W = 680;
const STACK_BAR_MAX = STACK_CHART_W - 60;

export function BarChart({
  data,
  ariaLabel,
  emptyText = "No data yet.",
  formatValue,
  stacked = false,
}: {
  data: Array<{ label: string; value: number }>;
  ariaLabel: string;
  emptyText?: string;
  // Renders the direct label next to each bar (e.g. money). Defaults to the raw number.
  formatValue?: (value: number) => string;
  // Puts each label on its own line above a full-width bar — use for long labels
  // (page paths) that would otherwise overlap the bars in the inline layout.
  stacked?: boolean;
}) {
  const fmt = formatValue ?? ((n: number) => String(n));
  const max = Math.max(...data.map((d) => d.value));
  if (max <= 0) {
    return <div className="admin-empty admin-empty--tall">{emptyText}</div>;
  }

  const rowH = stacked ? STACK_ROW_H : ROW_H;
  const chartW = stacked ? STACK_CHART_W : CHART_W;
  const barMax = stacked ? STACK_BAR_MAX : BAR_MAX;
  const barX = stacked ? 0 : LABEL_W;
  const height = data.length * rowH;
  return (
    <svg
      className={`admin-chart admin-chart-bars${stacked ? " admin-chart-bars--stacked" : ""}`}
      viewBox={`0 0 ${chartW} ${height}`}
      role="img"
      aria-label={ariaLabel}
      // Cap the inline variant near its native CHART_W (320) so a wide container
      // never upscales the SVG and blows its 12px text up to ~34px; the stacked
      // variant keeps its own wider cap.
    >
      <title>{ariaLabel}</title>
      {data.map((d, i) => {
        const w = d.value > 0 ? Math.max(2, (d.value / max) * barMax) : 0;
        const y = i * rowH;
        // Inline layout centers label + bar + value on one line; stacked drops the
        // label onto its own line above the bar.
        const barY = stacked ? y + 20 : y + 7;
        const labelY = stacked ? y + 13 : y + 19;
        const shownLabel =
          !stacked && d.label.length > LABEL_MAX_CHARS
            ? `${d.label.slice(0, LABEL_MAX_CHARS).trimEnd()}…`
            : d.label;
        return (
          <g key={d.label}>
            <text x={0} y={labelY} fontSize={12} fill="var(--admin-text-body)">
              <title>{d.label}</title>
              {shownLabel}
            </text>
            {w > 0 && (
              <rect x={barX} y={barY} width={w} height={16} rx={3} fill="var(--admin-accent)">
                <title>{`${d.label}: ${fmt(d.value)}`}</title>
              </rect>
            )}
            <text
              x={barX + w + 7}
              y={barY + 12}
              fontSize={12}
              fill="var(--admin-ink)"
              className="u-tabular"
            >
              {fmt(d.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

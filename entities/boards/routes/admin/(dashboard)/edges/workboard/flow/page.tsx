import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { PageHead } from "@/kernel/ui/PageHead";
import { ChartCard, StatTile } from "@/kernel/ui/dash/StatTile";
import { HBars } from "@/kernel/ui/dash/HBars";
import { Columns } from "@/kernel/ui/dash/Columns";
import { loadFlow, type BoardFlow } from "@/entities/boards/lib/flow-metrics";

export const metadata = {
  title: "Workboard · Flow",
  description: "What is stuck, blocked or overdue across every board, and how cards have been arriving and completing by week.",
};

// The Flow view (RH-6). Cards, columns and boards only: how long a card has
// sat in its column, how many are blocked or overdue, the weekly in-and-out.
// Nothing here is sliced by assignee, by design and by the aggregate's types.
export default async function WorkboardFlowPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("boards.open");
  const m = await loadFlow();
  const oldest = Math.max(0, ...m.perBoard.map((b) => b.oldestDays));
  const peak = m.weekly.reduce((a, w) => (w.created > a.created ? w : a), m.weekly[0]);
  return (
    <>
      <PageHead eyebrow="8 Edges" title="Workboard flow" sub="Every open card on every active board, read as work in motion: what is stuck, what is blocked, what is overdue." />

      <div className="dash-grid">
        <StatTile label="Open cards" value={m.open} sub={`${m.done} done · ${m.boards} boards with work`} href="/admin/edges/workboard" />
        {/* A zero is plain ink (W.113): green gave an empty count a tone it had
            not earned. Overdue is the error red every other surface uses for
            it (W.48), not amber; StatTile's tones stop at warn and ok, so the
            figure carries the utility itself. */}
        <StatTile label="Blocked" value={m.blocked} tone={m.blocked ? "warn" : undefined} sub="open cards with an open blocker" href="/admin/edges/workboard?attention=blocked" />
        <StatTile label="Overdue" value={m.overdue ? <span className="u-err">{m.overdue}</span> : m.overdue} sub={`${m.noDueDate} open cards carry no due date`} href="/admin/edges/workboard?attention=overdue" />
        <StatTile label="Oldest in a column" value={`${oldest} d`} sub="longest any open card has sat where it is" />
      </div>

      {/* wb-flow-charts lets the four age bands spread down a panel that the
          weekly chart beside it makes tall (admin.css). */}
      <div className="dash-grid wb-flow-charts">
        <ChartCard title="Open cards · days in current column" span={4} meta={`${m.open} cards`} note="From the stage log: the day the card entered its column. A card never moved counts from its creation.">
          <HBars rows={m.agingInColumn.map((b, i) => ({ ...b, tone: i >= 2 ? "warn" : undefined }))} />
        </ChartCard>
        <ChartCard title="Cards created and completed · by week" span={8} meta="last 12 weeks" note={peak && peak.created > 0 ? `Busiest week: ${peak.week}, ${peak.created} created and ${peak.completed} completed.` : undefined}>
          <Columns
            labels={m.weekly.map((w) => w.label)}
            series={[
              { name: "created", values: m.weekly.map((w) => w.created) },
              { name: "completed", values: m.weekly.map((w) => w.completed), tone: "ok" },
            ]}
          />
        </ChartCard>
        <ChartCard title="Boards · open work, blocked, overdue, oldest card" span={12} meta={`${m.perBoard.length} boards`} note="The strip is open cards per column, left to right; grey is the done column. Oldest is the longest a card has sat in its current column. Each row is a board, never a person.">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Board</th>
                <th>Columns</th>
                <th className="n">Open</th>
                <th className="n">Done</th>
                <th className="n">Blocked</th>
                <th className="n">Overdue</th>
                <th className="n">Oldest</th>
              </tr>
            </thead>
            <tbody>
              {m.perBoard.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link href={`/admin/boards/${b.slug}`}>{b.name}</Link>
                    {b.client && <span className="sub">client board</span>}
                  </td>
                  <td>
                    <ColumnStrip board={b} />
                  </td>
                  <td className="n">{b.open}</td>
                  <td className="n">{b.done}</td>
                  <td className="n">{b.blocked || "–"}</td>
                  <td className="n">{b.overdue || "–"}</td>
                  <td className="n">{b.oldestDays} d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartCard>
      </div>
    </>
  );
}

// One small stretched SVG per board: a column per board column, height by
// open cards; the done column drawn grey.
function ColumnStrip({ board }: { board: BoardFlow }) {
  const cols = board.columns;
  const max = Math.max(1, ...cols.map((c) => c.open));
  const w = 100 / Math.max(1, cols.length);
  return (
    <div className="dash-strip" title={cols.map((c) => `${c.name}: ${c.open}`).join(" · ")}>
      <svg viewBox="0 0 100 26" preserveAspectRatio="none" aria-hidden>
        {cols.map((c, i) => {
          const h = Math.max(2, (24 * c.open) / max);
          return <rect key={c.name + i} className={c.isDone ? "is-done" : undefined} x={i * w + 1} y={26 - h} width={Math.max(1, w - 2)} height={h} />;
        })}
      </svg>
    </div>
  );
}

import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge } from "@/kernel/ui/Badge";
import { ChartCard } from "@/kernel/ui/dash/StatTile";
import { HBars } from "@/kernel/ui/dash/HBars";
import { Columns } from "@/kernel/ui/dash/Columns";
import { businessDate } from "@/kernel/config/dates";
import { cardSlug } from "@/kernel/config/slug";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { mayProp } from "@/kernel/identity/may-prop";
import { loadFlow, STUCK_IN_COLUMN_DAYS, type BoardFlow, type StuckCard } from "@/entities/boards/lib/flow-metrics";
import { StuckCardPush } from "@/entities/boards/ui/StuckCardPush";

// Work Analytics (AH.7, was "Workboard flow", RH-6): where work is stuck, and
// the way to unstick it. It used to open on four counts and an 18-row table;
// now one sentence says how much is stuck, each figure filters the list of the
// cards behind it, boards rank by what is stuck rather than by size, and the
// boards with no open work fold into one line. Every figure is about cards and
// boards, never a person.

export const metadata = {
  title: "Work Analytics",
  description: "Where work is stuck across every board: blocked, late, or sat in one column too long, with the cards behind each figure.",
};

const BASE = "/admin/edges/workboard/flow";
const SHOWN = 15;
type Show = "all" | "blocked" | "late" | "old";
const FILTERS: Record<Exclude<Show, "all">, (c: StuckCard) => boolean> = {
  blocked: (c) => c.blocked,
  late: (c) => c.lateDays > 0,
  old: (c) => c.daysInColumn > STUCK_IN_COLUMN_DAYS,
};

const stuckScore = (b: BoardFlow) => b.blocked * 3 + b.overdue + (b.oldestDays > STUCK_IN_COLUMN_DAYS ? 1 : 0);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default async function WorkboardFlowPage(props: { searchParams: Promise<SearchParamsObj> }) {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("boards.open");
  const may = mayProp(access, ["boards.open"]);
  const params = await props.searchParams;
  const m = await loadFlow();
  const today = businessDate(new Date());
  const raw = firstParam(params.show);
  const show: Show = raw === "blocked" || raw === "late" || raw === "old" ? raw : "all";
  const counts = { blocked: m.stuck.filter(FILTERS.blocked).length, late: m.stuck.filter(FILTERS.late).length, old: m.stuck.filter(FILTERS.old).length };
  const list = show === "all" ? m.stuck : m.stuck.filter(FILTERS[show]);
  const working = m.perBoard.filter((b) => b.open > 0).sort((a, b) => stuckScore(b) - stuckScore(a) || b.oldestDays - a.oldestDays || b.open - a.open);
  const idle = m.perBoard.filter((b) => b.open === 0);
  const peak = m.weekly.reduce((a, w) => (w.created > a.created ? w : a), m.weekly[0]);
  const created = m.weekly.reduce((n, w) => n + w.created, 0);
  const completed = m.weekly.reduce((n, w) => n + w.completed, 0);

  const sentence =
    m.stuck.length === 0
      ? `${plural(m.open, "open card")} across ${plural(working.length, "board")}, and nothing is stuck.`
      : `${plural(m.open, "open card")} across ${plural(working.length, "board")}. ${counts.late} late, ${counts.blocked} blocked, and ${counts.old} sat in one column for over a month.`;
  const chip = (key: Show, label: string, n: number) => (
    <Link key={key} href={key === "all" ? BASE : `${BASE}?show=${key}`} className={`admin-chip${show === key ? " is-active" : ""}`} aria-current={show === key ? "true" : undefined}>
      {label} <Badge tone={key === "all" || n === 0 ? "neutral" : "err"}>{n}</Badge>
    </Link>
  );

  return (
    <>
      <PageHead eyebrow="Edges" title="Work Analytics" sub={sentence} />

      <div className="wb-stuck-chips">
        {chip("all", "All stuck", m.stuck.length)}
        {chip("late", "Late", counts.late)}
        {chip("blocked", "Blocked", counts.blocked)}
        {chip("old", `Over ${STUCK_IN_COLUMN_DAYS} days in a column`, counts.old)}
      </div>

      <section className="admin-card admin-section-card" aria-labelledby="stuck-h">
        <div className="admin-card-head">
          <h2 className="admin-card-title" id="stuck-h">
            Stuck cards <span className="admin-home-note">blocked first, then longest in one column</span>
          </h2>
          <Link href="/admin/edges/workboard?attention=overdue" className="admin-auth-link">
            Work Board →
          </Link>
        </div>
        {list.length === 0 ? (
          <p className="admin-home-quiet">Nothing here is stuck. Good.</p>
        ) : (
          <div className="admin-list">
            {list.slice(0, SHOWN).map((c) => (
              <div key={c.id} className="admin-list-row wb-stuck-row">
                <span className="admin-list-main">
                  <Link href={`/admin/boards/${c.boardSlug}?card=${cardSlug(c.title, c.id)}`} className="admin-list-title admin-home-title-link">
                    {c.title}
                  </Link>
                  <span className="admin-list-sub">
                    {c.boardName} · {c.column}
                  </span>
                </span>
                <span className="admin-list-aside admin-list-aside--row">
                  {c.blocked && <Badge tone="err">Blocked</Badge>}
                  {c.lateDays > 0 && <Badge tone="err">{plural(c.lateDays, "day")} late</Badge>}
                  {c.daysInColumn > STUCK_IN_COLUMN_DAYS && <Badge tone="warn">{c.daysInColumn} days in column</Badge>}
                  <StuckCardPush taskId={c.id} boardSlug={c.boardSlug} due={c.due} today={today} may={may} />
                </span>
              </div>
            ))}
            {list.length > SHOWN && <p className="admin-list-sub admin-home-more">{list.length - SHOWN} more, on the Work Board&rsquo;s Late and Blocked filters.</p>}
          </div>
        )}
      </section>

      <section className="admin-card admin-section-card" aria-labelledby="boards-h">
        <div className="admin-card-head">
          <h2 className="admin-card-title" id="boards-h">
            Boards <span className="admin-home-note">most stuck first</span>
          </h2>
        </div>
        <div className="admin-list">
          {working.map((b) => (
            <Link key={b.id} href={`/admin/boards/${b.slug}`} className="admin-list-row">
              <span className="admin-list-main">
                <span className="admin-list-title">{b.name}</span>
                <span className="admin-list-sub">
                  {[`${b.open} open`, b.overdue ? `${b.overdue} late` : null, b.blocked ? `${b.blocked} blocked` : null, `oldest ${b.oldestDays} days`].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="admin-list-aside">
                <ColumnStrip board={b} />
              </span>
            </Link>
          ))}
        </div>
        {idle.length > 0 && (
          <p className="admin-list-sub admin-home-more">
            {plural(idle.length, "board")} with no open work: {idle.map((b) => b.name).join(", ")}.
          </p>
        )}
      </section>

      {/* wb-flow-charts lets the four age bands spread down a panel that the
          weekly chart beside it makes tall (admin.css). */}
      <div className="dash-grid wb-flow-charts">
        <ChartCard title="Open cards · days in current column" span={4} meta={`${m.open} cards`} note="From the stage log: the day the card entered its column. A card never moved counts from its creation.">
          <HBars rows={m.agingInColumn.map((b, i) => ({ ...b, tone: i >= 2 ? "warn" : undefined }))} />
        </ChartCard>
        <ChartCard
          title="Cards created and completed · by week"
          span={8}
          meta="last 12 weeks"
          note={`${created >= completed ? `More started than finished: ${created} created, ${completed} completed.` : `Finishing more than starting: ${completed} completed, ${created} created.`}${peak && peak.created > 0 ? ` Busiest week: ${peak.week}.` : ""}`}
        >
          <Columns
            labels={m.weekly.map((w) => w.label)}
            series={[
              { name: "created", values: m.weekly.map((w) => w.created) },
              { name: "completed", values: m.weekly.map((w) => w.completed), tone: "ok" },
            ]}
          />
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

import { MONTH_NAMES } from "@/entities/coaching/lib/cadence";
import type { MonthCount, PracticeFacts } from "@/entities/coaching/lib/practice-facts";
import { Tile, plural } from "@/entities/coaching/ui/PracticeTiles";

// The second row of practice tiles, behind a disclosure and collapsed at every
// width (K.56). A server component, like the four tiles above it: a `<details>`
// opens and closes without a line of JavaScript, so the page that a coach opens
// before a 1-1 stays entirely server-rendered.
//
// Why these two are behind a fold rather than on the row. Both answer a
// second-order question — the four tiles say what the practice looks like, and
// these say what to do about the part of it that is off. A coach opening the
// page on a Monday wants the first four; a coach sitting down to fix their
// cadence wants these. That is the shape the skill's `progressive-disclosure`
// rule describes (quick-reference §8: "Reveal complex options progressively;
// don't overwhelm users upfront"), and the reason the answer is a disclosure
// rather than a phone-only breakpoint: on a desktop the six tiles would be the
// same wall, one row lower.
//
// The no-ranking rule that governs `PracticeTiles` governs this file exactly as
// hard. `PracticeFacts` has no person column, both tiles count things — goals
// and bookings — over the whole roster, and neither may ever take a second prop
// that carries a person (CLAUDE.md, "No metric describes a person"). A missed
// 1-1 in particular is never attributed here: the only place one is attached to
// a name is the row's own sentence, where it is an offer to rebook.
export function PracticeDetail({ facts }: { facts: PracticeFacts }) {
  return (
    <details open className="coach-more">
      <summary className="coach-more-summary">More about the practice</summary>
      <div className="coach-tiles coach-more-tiles">
        <GoalDetailTile facts={facts} />
        <MissedTile facts={facts} />
      </div>
    </details>
  );
}

// T4 — what a goal is missing besides its number. The tile in the row above
// says how many goals carry a target; this says what else they would need
// before the answer to "are we there yet" is a fact rather than an opinion.
//
// Three 100 % stacked bars, one per part, from the chart guidance's
// *Proportional / Percentage* row: the pie is `risk:high` and "explicitly wrong
// for an accessibility-first context", and its own threshold note says to
// switch to the stacked 100 % bar, which is also what the redesign's §C.2 asks
// for. Each bar carries its own count as text beside it, so the proportion is
// never the only way to read the number (skill priority 10, "relying on color
// alone to convey meaning").
function GoalDetailTile({ facts }: { facts: PracticeFacts }) {
  const { goalsTotal: total, goalsWithNumber, goalsWithMeasure, goalsWithDueDate } = facts;
  const parts = [
    // `missing` carries no article, because the sentence below puts "no" in
    // front of it: "3 goals have no target number".
    { label: "A target number", missing: "target number", of: goalsWithNumber },
    { label: "A unit to measure it in", missing: "unit to measure them in", of: goalsWithMeasure },
    { label: "A day it is due by", missing: "day they are due by", of: goalsWithDueDate },
  ];
  const weakest = parts.reduce((a, b) => (b.of < a.of ? b : a));
  return (
    <section className="admin-card coach-tile">
      <h3 className="coach-tile-label">Goals with a number, in detail</h3>
      {total === 0 ? (
        <p className="coach-tile-caption">
          Nobody on the roster has an active goal yet, so there is nothing to take apart. Shaping
          the first one is what an early 1-1 is for.
        </p>
      ) : (
        <>
          <ul className="coach-bars">
            {parts.map((part) => (
              <li className="coach-bar-row" key={part.label}>
                <span className="coach-bar-label">{part.label}</span>
                <svg className="coach-bar" height="8" width="100%" aria-hidden focusable="false">
                  <rect x="0" y="0" width="100%" height="8" rx="4" className="coach-tile-track" />
                  <rect
                    x="0"
                    y="0"
                    width={`${(part.of / total) * 100}%`}
                    height="8"
                    rx="4"
                    className="coach-detail-fill"
                  />
                </svg>
                <span className="coach-bar-count">
                  {part.of} of {total}
                </span>
              </li>
            ))}
          </ul>
          <p className="coach-tile-caption">
            {weakest.of === total
              ? "Every active goal is fully shaped. The 1-1s can be about the work itself."
              : `${plural(total - weakest.of, "goal has", "goals have")} no ${weakest.missing} — the part most often left off, and a good question for a 1-1 rather than a fault of the person whose goal it is.`}
          </p>
        </>
      )}
    </section>
  );
}

// T6 — the 1-1s that did not happen, and how that has run. A stat card with a
// six-month sparkline, from the chart guidance's *Trend Over Time* row (line
// chart, `risk:low`, and its own "fewer than 4 data points (use stat card)"
// threshold, which six months clears). Its accessibility fallback asks for a
// "concise trend summary" instead of hover values, which is what the sentence
// in the `aria-label` is — there is nothing to hover here in any case.
//
// The line is ink rather than mint and never a warning hue: mint on this page
// means something happened, and a red line under a coach's own cadence is the
// enforcement tone this product does not use (K.45).
function MissedTile({ facts }: { facts: PracticeFacts }) {
  const { passedUnheld, missedByMonth } = facts;
  const series = missedByMonth.map((m) => m.missed);
  const total = series.reduce((sum, n) => sum + n, 0);
  return (
    <Tile
      label="1-1s that did not happen"
      ariaLabel={
        total === 0
          ? "No booking in the last six months passed without the 1-1 happening."
          : `${plural(passedUnheld, "booking", "bookings")} passed unheld this month. Month by month over the last six, that has run ${series.join(", ")}.`
      }
      chart={<Spark points={missedByMonth} />}
      figure={passedUnheld === 0 ? "None this month" : `${passedUnheld} this month`}
      caption={
        total === 0
          ? "Six months with every booking held."
          : "Rebooking one is a kindness, not a chase."
      }
    />
  );
}

// The sparkline, drawn in a 120 × 34 box that the tile stretches to its own
// width. `preserveAspectRatio="none"` is what lets the line span a tile of any
// width, and `vector-effect` is what keeps that stretch from thinning the
// stroke along with it.
const SPARK_W = 120;
const SPARK_H = 34;
const SPARK_TOP = 5;
const SPARK_FLOOR = 25;

function Spark({ points }: { points: MonthCount[] }) {
  if (points.length < 2) return null;
  const peak = Math.max(...points.map((p) => p.missed), 1);
  const x = (i: number) => (i / (points.length - 1)) * (SPARK_W - 8) + 4;
  // A month with none sits on the floor rather than off the bottom of the box,
  // so a flat run of zeroes reads as a line at rest and not as a missing chart.
  const y = (n: number) => SPARK_FLOOR - (n / peak) * (SPARK_FLOOR - SPARK_TOP);
  const last = points.length - 1;
  return (
    <div className="coach-spark-wrap">
      <svg
        className="coach-spark"
        width="100%"
        height={SPARK_H}
        viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
        preserveAspectRatio="none"
        aria-hidden
        focusable="false"
      >
        <polyline
          className="coach-spark-line"
          vectorEffect="non-scaling-stroke"
          points={points.map((p, i) => `${x(i)},${y(p.missed)}`).join(" ")}
        />
        {/* The month the figure above is about, marked so the line has a near
            end as well as a far one. */}
        <circle className="coach-spark-now" cx={x(last)} cy={y(points[last].missed)} r="2.5" />
      </svg>
      {/* The month names sit outside the SVG rather than in it: the box is
          stretched horizontally to the tile's width, and text stretched with it
          would be a squashed typeface. Only the ends are named, because six
          labels at this width overlap and what the line is for is the run
          between them, not a reading per month. */}
      <div className="coach-spark-axis" aria-hidden>
        <span>{monthLabel(points[0].month)}</span>
        <span>{monthLabel(points[last].month)}</span>
      </div>
    </div>
  );
}

// "2026-04" as "Apr", read from the string alone so the server's locale never
// gets a say, the way every other date label on this page is.
function monthLabel(month: string): string {
  return MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? month;
}

import type { PracticeFacts } from "@/entities/coaching/lib/practice-facts";

// The four tiles about the coaching practice (K.54, K.55), drawn as inline SVG
// from tokens only. A server component: nothing here has state, and nothing
// here is hoverable, so there is no reason to ship it to the browser.
//
// Every tile passes the two tests from the redesign (§C.2): the unit it counts
// is a thing — a meeting, a commitment, a goal — and sorting the roster by it
// would not produce a league table of people, because there is nothing
// per-person to sort. `PracticeFacts` has no person column, which is where the
// rule is actually enforced; this file must never take a second prop that has
// one. No tile names anybody, no cell or dot carries a tooltip, and no tile
// uses a red or a warning colour: a red state on a coaching page is a metric
// describing a person by another route (CLAUDE.md, "No metric describes a
// person").
//
// Charts are chosen from ui-ux-pro-max `charts.csv`: the bullet chart from row
// 18 "Performance vs Target (Compact)" (`risk:low`, "space-constrained
// contexts where a gauge is too large"), the waffles from row 19
// "Proportional / Percentage" (`risk:low`, "showing what fraction of a whole
// is filled … in a visually engaging and accessible format"), and the dot
// strip from row 17's secondary option "Beeswarm" — that row's own caveat,
// "fewer than 20 data points per group (distribution is not meaningful)",
// rules out the box plot for a roster of six. Each tile carries `role="img"`
// and a sentence `aria-label`, so the shape is never the only way to read it
// (skill priority 1, and priority 10's "relying on color alone to convey
// meaning").

export function PracticeTiles({ facts }: { facts: PracticeFacts }) {
  return (
    <div className="coach-tiles">
      <MonthTile facts={facts} />
      <CommitmentTile facts={facts} />
      <DriftTile facts={facts} />
      <GoalNumberTile facts={facts} />
    </div>
  );
}

// The shell every practice tile shares: a label, one chart that is one image,
// the figure, and the sentence under it. Exported since K.56 so the two tiles
// behind the disclosure are the same object as the four above them rather than
// a second kind of tile that drifts away from these (CLAUDE.md rule 3).
export function Tile({
  label,
  chart,
  ariaLabel,
  figure,
  caption,
}: {
  label: string;
  chart: React.ReactNode;
  ariaLabel: string;
  figure: string;
  caption: string;
}) {
  return (
    <section className="admin-card coach-tile">
      <h3 className="coach-tile-label">{label}</h3>
      {/* The chart is one image with one sentence, not a tree of labelled
          parts: a screen reader should hear what the coach sees at a glance
          and then go on to the rows, which is where the detail belongs. */}
      <div className="coach-tile-chart" role="img" aria-label={ariaLabel}>
        {chart}
      </div>
      <p className="coach-tile-figure">{figure}</p>
      <p className="coach-tile-caption">{caption}</p>
    </section>
  );
}

// T1 — the month's cadence. The unit is meetings and the subject is the
// coach's own practice, so there is nothing here about anybody else.
function MonthTile({ facts }: { facts: PracticeFacts }) {
  const { heldThisMonth: held, plannedThisMonth: planned, passedUnheld } = facts;
  // The axis runs a little past the target so the marker sits inside the track
  // rather than on its edge, where a 2px line would be lost to the rounding.
  const axis = planned > 0 ? planned * 1.1 : 1;
  const missedClause =
    passedUnheld > 0 ? ` ${plural(passedUnheld, "booking", "bookings")} passed without happening.` : "";
  return (
    <Tile
      label="1-1s this month"
      ariaLabel={
        planned === 0
          ? "No 1-1s are on this month's calendar yet."
          : `This month, ${held} of the ${planned} 1-1s on the calendar have been held.${missedClause}`
      }
      chart={
        <svg height="12" width="100%" aria-hidden focusable="false">
          <rect x="0" y="0" width="100%" height="12" rx="6" className="coach-tile-track" />
          <rect x="0" y="0" width={pct(held / axis)} height="12" rx="6" className="coach-tile-fill" />
          <rect x={pct(planned / axis)} y="0" width="2" height="12" className="coach-tile-marker" />
        </svg>
      }
      figure={planned === 0 ? "Nothing booked" : `${held} held, ${planned} planned`}
      caption={
        planned === 0
          ? "Put the month's 1-1s in the calendar and this fills up."
          : passedUnheld > 0
            ? `${plural(passedUnheld, "day", "days")} passed unheld — rebooking is a kindness.`
            : "The marker is the month you planned."
      }
    />
  );
}

// T2 — what the roster promised. One cell is one commitment and the cells are
// deliberately unattributed: hovering one reveals nothing, by design. This is
// the tile most at risk of being turned into a per-person view later, and it
// must not be.
function CommitmentTile({ facts }: { facts: PracticeFacts }) {
  const { kept, promised } = facts;
  return (
    <Tile
      label="What people promised"
      ariaLabel={
        promised === 0
          ? "No commitments have been made since the last 1-1s."
          : `${kept} of ${promised} commitments made since the last 1-1s have been kept; the rest are still open.`
      }
      chart={<Waffle filled={kept} total={promised} />}
      figure={promised === 0 ? "Nothing promised yet" : `${kept} of ${promised} kept`}
      caption={
        promised === 0
          ? "Commitments made in a 1-1 show up here."
          : "Since each person's last 1-1. An open one is not a failure."
      }
    />
  );
}

// T3 — the shape of the drift, and nothing else. Unlabelled, unsorted by
// person and un-hoverable on purpose: the coach learns that two conversations
// have drifted and has to read the rows below to learn whose, which is the
// humane order. A sorted bar chart of the same numbers with names on it would
// be a ranking of people by neglect and is banned.
function DriftTile({ facts }: { facts: PracticeFacts }) {
  const { daysSince, neverMet } = facts;
  const longest = daysSince.length > 0 ? daysSince[daysSince.length - 1] : 0;
  const neverClause = neverMet > 0 ? ` ${plural(neverMet, "person has", "people have")} not had one yet.` : "";
  return (
    <Tile
      label="Days since the last 1-1"
      ariaLabel={
        daysSince.length === 0
          ? `No 1-1s have been held yet.${neverClause}`
          : `${plural(daysSince.length, "conversation", "conversations")}, spread from ${daysSince[0]} to ${longest} days ago.${neverClause}`
      }
      chart={<DotStrip days={daysSince} />}
      // Short enough to stay on one line in a 220px tile, so the four figures
      // sit on the same baseline across the row.
      figure={daysSince.length === 0 ? "None held yet" : `Up to ${plural(longest, "day", "days")}`}
      caption="Read the rows below to see who"
    />
  );
}

// T5 — goals with a number. The unit is goals; a goal without a measure is a
// coaching-craft signal (the F-A-S-T "S" is missing), not a fault of the
// person whose goal it is, and the caption says so.
function GoalNumberTile({ facts }: { facts: PracticeFacts }) {
  const { goalsWithNumber: withNumber, goalsTotal: total } = facts;
  const without = total - withNumber;
  return (
    <Tile
      label="Goals with a number"
      ariaLabel={
        total === 0
          ? "Nobody on the roster has an active goal yet."
          : `${withNumber} of ${total} active goals carry a target number; ${without} do not.`
      }
      chart={<Waffle filled={withNumber} total={total} />}
      figure={total === 0 ? "No active goals" : `${withNumber} of ${total} measured`}
      caption={
        total === 0
          ? "Shaping the first goal is what an early 1-1 is for."
          : without > 0
            ? `${plural(without, "goal", "goals")} could use a number — a good 1-1 question.`
            : "Every active goal has a measure."
      }
    />
  );
}

// A waffle of one cell per thing, filled cells first. Above a hundred things
// the cells stop being one-to-one and become percentage points, because a grid
// of two hundred 8px squares is a texture rather than a count; the figure and
// the sentence still carry the true numbers.
function Waffle({ filled, total }: { filled: number; total: number }) {
  const cells = Math.min(total, 100);
  const on = total > 100 ? Math.round((filled / total) * 100) : filled;
  const columns = 10;
  const rows = Math.max(Math.ceil(cells / columns), 1);
  const pitch = 11;
  return (
    <svg
      className="coach-tile-waffle"
      width={columns * pitch - 3}
      height={rows * pitch - 3}
      viewBox={`0 0 ${columns * pitch - 3} ${rows * pitch - 3}`}
      aria-hidden
      focusable="false"
    >
      {Array.from({ length: cells }, (_, i) => (
        <rect
          key={i}
          x={(i % columns) * pitch}
          y={Math.floor(i / columns) * pitch}
          width="8"
          height="8"
          rx="2"
          className={i < on ? "coach-tile-cell coach-tile-cell--on" : "coach-tile-cell"}
        />
      ))}
    </svg>
  );
}

// The days axis runs 0 to 28+; anything older sits on the last tick, because
// the difference between six weeks and eight is not the news — that it has
// been a long time is.
const AXIS_DAYS = 28;
const TICKS = [0, 7, 14, 21, 28];

function DotStrip({ days }: { days: number[] }) {
  return (
    <svg height="42" width="100%" aria-hidden focusable="false">
      {days.map((d, i) => (
        <circle key={i} cx={axisPct(d)} cy="12" r="4" className="coach-tile-dot" />
      ))}
      <rect x="4%" y="26" width="92%" height="1" className="coach-tile-axis" />
      {/* The end labels are anchored to the ends rather than centred on their
          ticks, because "28+" centred at 96% loses its last character off the
          edge of a tile two-up on a phone. */}
      {TICKS.map((t, i) => (
        <text
          key={t}
          x={i === 0 ? "0" : i === TICKS.length - 1 ? "100%" : axisPct(t)}
          y="40"
          textAnchor={i === 0 ? "start" : i === TICKS.length - 1 ? "end" : "middle"}
          className="coach-tile-tick"
        >
          {t === AXIS_DAYS ? "28+" : t}
        </text>
      ))}
    </svg>
  );
}

// Percentages keep both charts undistorted at any tile width, which a viewBox
// stretched with preserveAspectRatio="none" would not. The 4 % inset is the
// room a dot on either end needs so it is not clipped by the tile's edge.
function axisPct(day: number): string {
  return `${4 + (Math.min(day, AXIS_DAYS) / AXIS_DAYS) * 92}%`;
}

function pct(fraction: number): string {
  return `${Math.min(Math.max(fraction, 0), 1) * 100}%`;
}

// "1 booking" / "3 bookings". Shared with the disclosure's tiles for the same
// reason the shell is.
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// The sprint ring (W.173), redrawn after review called the first one blunt: a
// single arc said "some share is done" and nothing else. This one says three
// things at a glance and in words beside it:
//
//   - one segment per card in your sprint, so the whole is countable: closed
//     cards are filled, started ones half-tone, the rest an outline;
//   - an outer track of the sprint's seven days with today marked, so how far
//     the work has come sits beside how far the week has;
//   - the count in the middle, "10 of 17", and the legend in words, so the
//     ring never relies on its colours (WCAG 1.4.1).
//
// It measures the reader's own sprint and nothing else. It is the left half of
// the Your sprint card (MyWeekSprint.tsx), beside Next up. A server component:
// plain SVG, no JavaScript.
import type { SprintRing } from "@/entities/boards/lib/my-week-sprint";

const C = 80;
const CARD_R = 56;
const DAY_R = 72;
// Past this many cards a gap between segments is thinner than a hairline.
const MAX_GAPPED = 48;

/** An arc on a circle, in degrees clockwise from twelve o'clock. */
function arc(r: number, from: number, to: number): string {
  const at = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return `${(C + r * Math.cos(rad)).toFixed(2)} ${(C + r * Math.sin(rad)).toFixed(2)}`;
  };
  return `M ${at(from)} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${at(to)}`;
}

export function MyWeekRing({ ring, weekday }: { ring: SprintRing; weekday: string }) {
  const { closed, doing, waiting, total, dayIndex, days } = ring;
  const gap = total > 1 && total <= MAX_GAPPED ? 3 : 0;
  const slice = total > 0 ? 360 / total : 360;
  const left = doing + waiting;
  const label = `${closed} of ${total} cards closed, ${doing} in progress, ${waiting} not started. Day ${dayIndex + 1} of ${days} of the sprint.`;

  return (
    <div className="admin-myweek-ring">
      <div className="admin-myweek-ring-body">
        <svg className="admin-myweek-ring-svg" viewBox="0 0 160 160" role="img" aria-label={label}>
          {Array.from({ length: days }, (_, i) => (
            <path
              key={`d${i}`}
              className={`admin-myweek-ring-day${i < dayIndex ? " is-past" : i === dayIndex ? " is-today" : ""}`}
              d={arc(DAY_R, (360 / days) * i + 2, (360 / days) * (i + 1) - 2)}
            />
          ))}
          {total === 0 ? (
            <circle className="admin-myweek-ring-seg" cx={C} cy={C} r={CARD_R} />
          ) : (
            Array.from({ length: total }, (_, i) => (
              <path
                key={i}
                className={`admin-myweek-ring-seg${i < closed ? " is-closed" : i < closed + doing ? " is-doing" : ""}`}
                d={total === 1 ? arc(CARD_R, 0, 359.99) : arc(CARD_R, slice * i + gap / 2, slice * (i + 1) - gap / 2)}
              />
            ))
          )}
          <text className="admin-myweek-ring-n" x={C} y={C + 4} textAnchor="middle">
            {closed}
          </text>
          <text className="admin-myweek-ring-of" x={C} y={C + 24} textAnchor="middle">
            {total === 0 ? "nothing yet" : `of ${total} closed`}
          </text>
        </svg>
        <ul className="admin-myweek-ring-legend">
          <li>
            <span className="admin-myweek-key is-closed" aria-hidden="true" />
            {closed} closed
          </li>
          <li>
            <span className="admin-myweek-key is-doing" aria-hidden="true" />
            {doing} in progress
          </li>
          <li>
            <span className="admin-myweek-key" aria-hidden="true" />
            {waiting} to start
          </li>
          <li className="admin-myweek-ring-when">
            <span className="admin-myweek-key is-today" aria-hidden="true" />
            Day {dayIndex + 1} of {days} · {weekday}
          </li>
        </ul>
      </div>
      <p className="admin-myweek-ring-say">
        {total === 0
          ? "Nothing of yours is in this sprint yet."
          : left === 0
            ? "Every card in your sprint is closed."
            : `${left} to go${dayIndex + 1 < days ? `, ${days - dayIndex - 1} ${days - dayIndex - 1 === 1 ? "day" : "days"} after today` : ", and today is the last day"}.`}
      </p>
    </div>
  );
}

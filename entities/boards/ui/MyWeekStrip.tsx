// The week strip (W.102.2, redrawn in W.169 and W.171): eight cells — what is
// late, then each day of the Wednesday-to-Tuesday sprint — each a count, never
// a bar.
//
// It is navigation, so every cell with something under it is an anchor to that
// section, and its name says the count in words ("Monday 12 Oct, 2 due"): a
// link named "2" names nothing (WCAG 2.4.4). The counts are the model's
// (lib/my-week.ts strip), which reads the same buckets the sections list — the
// strip and the page below it cannot disagree.
//
// ONE UNIT PER CELL (W.171, from the 2026-10-06 review). A past day says what
// finished on it ("13 done"), on a settled surface rather than the dashed
// border this page uses for "nothing here"; a day ahead says what is due;
// today says both, "7 open · 11 done", so the done counts across the strip add
// up to the sprint's. On the last day the cell says so.
//
// On a phone the eight cells fit the column instead of scrolling sideways (the
// last cell, Today on the sprint's last day, used to start off screen): the
// weekday drops and a past day's count becomes a dot, and the full words stay
// in each cell's accessible name.
//
// A div with role="navigation" and not a <nav>: app/globals.css styles every
// bare `nav` as the fixed marketing header (z-index 1000), which pins anything
// so tagged to the top of the screen.
import type { MyWeekModel } from "@/entities/boards/lib/my-week";
import { chipDate, dayOfMonth, weekdayOf } from "./card-chips";

export const TODAY_ANCHOR = "my-week-today";
export const DOING_ANCHOR = "my-week-doing";
export const dayAnchor = (date: string) => `my-week-${date}`;

const cards = (n: number) => `${n} ${n === 1 ? "card" : "cards"}`;

export function MyWeekStrip({ model }: { model: MyWeekModel }) {
  const { late, days } = model.strip;
  // The Today section is drawn whenever anything of yours is on the page; In
  // progress, which comes first, whenever it holds a card.
  const todayDrawn = model.counts.open > 0 || model.counts.waiting > 0;
  const todayHref = `#${model.doing.length > 0 ? DOING_ANCHOR : TODAY_ANCHOR}`;
  const lateHref = `#${model.now.some((r) => r.lateDays > 0) ? TODAY_ANCHOR : DOING_ANCHOR}`;
  return (
    <div role="navigation" aria-label="This sprint by day" className="admin-myweek-strip">
      <ol className="admin-myweek-cells">
        <li>
          {late > 0 ? (
            <a className="admin-myweek-cell admin-myweek-cell--late" href={lateHref} aria-label={`Late, ${cards(late)}`}>
              <span className="admin-myweek-cell-day">Late</span>
              <span className="admin-myweek-cell-n">{late}</span>
            </a>
          ) : (
            <span className="admin-myweek-cell is-quiet" role="img" aria-label="Nothing late">
              <span className="admin-myweek-cell-day">Late</span>
              <span className="admin-myweek-cell-n">–</span>
            </span>
          )}
        </li>
        {days.map((d) => {
          const day = (
            <span className="admin-myweek-cell-day">
              <span className="admin-myweek-cell-wd">{weekdayOf(d.date)} </span>
              {dayOfMonth(d.date)}
            </span>
          );
          if (d.open === null) {
            return (
              <li key={d.date}>
                <span className="admin-myweek-cell is-past" role="img" aria-label={`${chipDate(d.date)}, ${d.finished} finished`}>
                  {day}
                  <span className="admin-myweek-cell-done">{d.finished > 0 ? `${d.finished} done` : ""}</span>
                </span>
              </li>
            );
          }
          if (d.isToday) {
            const name = `Today${model.isLastDay ? ", the sprint's last day" : ""}, ${chipDate(d.date)}, ${d.open} open, ${d.finished} finished`;
            const cls = `admin-myweek-cell is-today${d.open === 0 ? " is-quiet" : ""}`;
            const inner = (
              <>
                <span className="admin-myweek-cell-day">
                  Today{model.isLastDay && <span className="admin-myweek-cell-last"> · last day</span>}
                </span>
                <span className="admin-myweek-cell-n">
                  {d.open} open
                  {d.finished > 0 && <span className="admin-myweek-cell-done"> · {d.finished} done</span>}
                </span>
              </>
            );
            return (
              <li key={d.date} className="admin-myweek-cells-today">
                {todayDrawn ? (
                  <a className={cls} href={todayHref} aria-label={name} aria-current="date">
                    {inner}
                  </a>
                ) : (
                  <span className={cls} role="img" aria-label={name}>
                    {inner}
                  </span>
                )}
              </li>
            );
          }
          const name = `${chipDate(d.date)}, ${d.open} due`;
          const cls = `admin-myweek-cell${d.open === 0 ? " is-quiet" : ""}`;
          const inner = (
            <>
              {day}
              <span className="admin-myweek-cell-n">{d.open}</span>
            </>
          );
          return (
            <li key={d.date}>
              {/* A cell with nothing under it is not a link: an anchor to a
                  section the page did not render scrolls nowhere. */}
              {d.open > 0 ? (
                <a className={cls} href={`#${dayAnchor(d.date)}`} aria-label={name}>
                  {inner}
                </a>
              ) : (
                <span className={cls} role="img" aria-label={name}>
                  {inner}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

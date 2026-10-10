// My Week (W.61; W.102; rebuilt in W.169 as one reading column): the page a
// person opens to see their own work.
//
// WHY IT LOOKS LIKE THIS. Until W.169 the page was four figure boxes, a bar
// chart, and a section for every day of the sprint — 178 open rows for its
// heaviest reader, and nothing saying what to do first. On 2026-10-06 Khoa
// chose the "Reading column" from three prototype layouts (branch
// prototype/my-week-w169), backed by two research passes on how work tools and
// planners lay out a personal week (agenda buckets, not a seven-day grid) and a
// third on polishing it (one alert colour, aligned titles, counted link names).
// So it reads top to bottom as answers:
//
//   1. A sentence saying what needs you, as the page's heading, and the Inbox
//      in one line when it holds something new.
//   2. The strip: the shape of the sprint, each cell a way into its section.
//   3. In progress, then Today: started work keeps its own date under its own
//      heading (W.171); Today is late, due today and the blockers waiting on
//      you. On the sprint's last day the head says so, and what happens to
//      anything still open.
//   4. New to you (new work with no day yet), then each later day that holds
//      work, then what is due after the sprint, then No date.
//   5. Your boards: where the work sits, one compact card each.
//   6. Your sprint (W.173, MyWeekSprint.tsx): the ring and Next up, the
//      plant your finished cards fed and the badges they unlocked, and the
//      garden of past sprints. On a wide screen the first two are a band
//      above the agenda, which then runs in two columns, and the garden and
//      Your boards sit beside it. The 2026-10-07 review: the single 780px
//      column left most of the screen empty and gave nobody a reason to come
//      back.
//
// Each open card is listed exactly once (lib/my-week.ts), finished work is
// never a list (since W.173 it is leaves and badges, not just a count), and
// nothing folds (W.94): a page is shortened by what it reads, not by what it
// hides behind a triangle.
//
// IT IS A SELF-VIEW AND NOTHING ELSE. There is no person picker and nowhere to
// put one: the read is the signed-in person's own, and nothing here is
// compared, ranked, summed across people or sent anywhere. No rate, ratio or
// percentage appears beyond the ring's share of the reader's own sprint (W.173,
// approved in review), and Human Tokens are only ever tokens.
//
// A server component, with three small client islands: Give it a day, Start,
// and the plant's feeding animation. The strip's cells are anchors, so the
// page works before hydration.
import type { ReactNode } from "react";
import Link from "next/link";
import { formatTokens } from "@/entities/boards/lib/tokens";
import { summaryLine, weekLabel, type MyWeekBoardSummary, type MyWeekModel, type MyWeekRow as Row } from "@/entities/boards/lib/my-week";
import { MyWeekRow, type MyWeekSection } from "./MyWeekRow";
import { MyWeekGiveDay } from "./MyWeekGiveDay";
import { MyWeekShipped } from "./MyWeekShipped";
import { MyWeekSide, MyWeekSprintCard } from "./MyWeekSprint";
import { dayAnchor, DOING_ANCHOR, MyWeekStrip, TODAY_ANCHOR } from "./MyWeekStrip";
import { nearDate, windowLabel } from "./my-week-dates";
import { chipDate } from "./card-chips";
import { addDays } from "@/kernel/config/dates";

// Finished work is one line and one link: the board's list on its Done lane,
// which already knows how to show it, at a URL that names no person.
const FINISHED_HREF = "/team/workboard?view=list&lane=Done";
const WORKBOARD_HREF = "/team/workboard";

export function MyWeek({ model, inboxLine = null }: { model: MyWeekModel; inboxLine?: ReactNode }) {
  const ahead = model.days.filter((d) => d.date > model.today && d.open.length > 0);
  const nothingAtAll = model.counts.open === 0 && model.counts.waiting === 0;
  const place = sharedPlace(model);
  const week = weekLabel(model.week);
  const rows = (list: Row[], section: MyWeekSection, giveDay = false) => (
    <ul className="admin-myweek-list">
      {list.map((r) => (
        <MyWeekRow
          key={r.id}
          row={r}
          today={model.today}
          endsOn={model.window.endsOn}
          section={section}
          hidePlace={place !== null}
          action={giveDay ? <MyWeekGiveDay taskId={r.id} title={r.title} today={model.today} defaultDay={addDays(model.today, 1)} /> : null}
        />
      ))}
    </ul>
  );

  return (
    <div className="admin-myweek">
      <header className="admin-myweek-head">
        <p className="admin-eyebrow">
          My week · {week} · {windowLabel(model.window.startsOn, model.window.endsOn)}
          {model.isLastDay && (
            <>
              {" · "}
              <strong className="admin-myweek-ends-tag">ends today</strong>
            </>
          )}
        </p>
        <h1 className="admin-myweek-summary">{summaryLine(model)}</h1>
        {/* The one sentence a sprint's last day owes the reader: what happens
            to what is still open. A fact, not a countdown or a nudge. */}
        {model.isLastDay && model.counts.open > 0 && (
          <p className="admin-myweek-ends">
            Last day of {week}. Anything still open after today carries into {weekLabel(model.nextWeek)}.
          </p>
        )}
        {/* Every row lives in one place: said once here, not on every row. */}
        {place && <p className="admin-myweek-place">All on {place}</p>}
      </header>

      {/* The Inbox in one line, when the deployment has an inbox and it holds
          something new (W.169.4); otherwise nothing at all. */}
      {inboxLine}

      <MyWeekStrip model={model} />

      {/* The band (W.173): on a wide screen Your sprint and the Shipped shelf
          run across the top, the agenda in two columns below, the garden and
          the boards beside it. Narrower, one column: Your sprint, the agenda,
          then the shelf and the side. The source keeps that narrow order, so
          the keyboard and a screen reader read it the same way at any width;
          grid areas in admin.css place the shelf in the band. */}
      <div className="admin-myweek-body">
        <MyWeekSprintCard model={model} />
        <div className="admin-myweek-main">
          {nothingAtAll ? (
            <p className="admin-myweek-empty admin-myweek-empty--page">
              Nothing of yours is in this sprint yet. Sprint planning is where that is decided, and the{" "}
              <Link href={WORKBOARD_HREF}>Workboard</Link> holds everything else assigned to you.
            </p>
          ) : (
            <>
              {model.doing.length > 0 && (
                <Section id={DOING_ANCHOR} title="In progress" count={model.doing.length} hint="Started and not finished. Each keeps its own due date.">
                  {rows(model.doing, "doing")}
                </Section>
              )}

              <Section id={TODAY_ANCHOR} title="Today" count={model.now.length}>
                {model.now.length > 0 ? rows(model.now, "today") : <DayClear line={clearDay(model)} />}
              </Section>

              {model.fresh.length > 0 && (
                <Section id="my-week-new" title="New to you" count={model.fresh.length} hint="Assigned to you in the last seven days, with no day in this sprint yet. Give each one a day.">
                  {rows(model.fresh, "fresh", true)}
                </Section>
              )}

              {ahead.map((d) => (
                <Section key={d.date} id={dayAnchor(d.date)} title={chipDate(d.date)} count={d.open.length}>
                  {rows(d.open, "day")}
                </Section>
              ))}

              {model.later.length > 0 && (
                <Section id="my-week-later" title="After this sprint" count={model.later.length} hint="Yours and in this sprint, but due after it ends.">
                  {rows(model.later, "later")}
                </Section>
              )}

              {model.undated.length > 0 && (
                <Section id="my-week-undated" title="No date" count={model.undated.length} hint="Open this sprint with no due date.">
                  {rows(model.undated, "undated", true)}
                </Section>
              )}
            </>
          )}

          <Footer model={model} />
        </div>
        <MyWeekShipped week={model.week} fed={model.rail.fed} badges={model.rail.badges} />
        <MyWeekSide model={model}>
          {model.boards.length > 0 && (
            <Section id="my-week-boards" title="Your boards">
              <ul className="admin-myweek-boards">
                {model.boards.map((b) => (
                  <BoardCard key={b.id} board={b} today={model.today} />
                ))}
              </ul>
            </Section>
          )}
        </MyWeekSide>
      </div>
    </div>
  );
}

/**
 * Today with nothing in it (W.173): a cleared day is worth a moment, so it gets
 * a tick that draws itself rather than the dashed box this page uses for
 * "nothing here". Reduced motion gets the tick, already drawn.
 */
function DayClear({ line }: { line: string }) {
  return (
    <div className="admin-myweek-clear">
      <svg className="admin-myweek-clear-tick" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
        <circle className="admin-myweek-clear-ring" cx="20" cy="20" r="17" />
        <path className="admin-myweek-clear-mark" d="M12 20.5l5.5 5.5L28.5 14" />
      </svg>
      <div>
        <p className="admin-myweek-clear-h">Day clear</p>
        <p className="admin-myweek-clear-line">{line}</p>
      </div>
    </div>
  );
}

/**
 * The place every listed row shares, or null when they live in more than one.
 * "Edge8 · 8 Edges" eight times over is two lines per row for one fact.
 */
function sharedPlace(model: MyWeekModel): string | null {
  const all = [...model.doing, ...model.now, ...model.fresh, ...model.days.flatMap((d) => d.open), ...model.later, ...model.undated];
  const places = new Set(all.map((r) => r.place).filter(Boolean));
  return all.length > 1 && places.size === 1 ? [...places][0]! : null;
}

/** Said when Today is empty: a clear day is information, and so is what comes next. */
function clearDay(model: MyWeekModel): string {
  // A started card can be late and still not be Today's: then the day is clear
  // of due work, and saying "nothing late" would be false (W.171).
  const clear = model.counts.late > 0 ? "Nothing due today" : "Nothing due today and nothing late";
  const next = model.days.find((d) => d.date > model.today && d.open.length > 0);
  if (!next) return `${clear}.`;
  const n = next.open.length;
  return `${clear}. Next: ${n} ${n === 1 ? "card" : "cards"} on ${chipDate(next.date)}.`;
}

function Section({ id, title, count, hint, children }: { id: string; title: string; count?: number; hint?: string; children: ReactNode }) {
  return (
    <section className="admin-myweek-section" id={id} aria-labelledby={`${id}-h`}>
      <h2 className="admin-myweek-h" id={`${id}-h`}>
        {title}
        {count !== undefined && count > 0 && <span className="admin-myweek-count">{count}</span>}
      </h2>
      {hint && <p className="admin-myweek-hint">{hint}</p>}
      {children}
    </section>
  );
}

/** One board, one link: the counts in words, zeros left out, and the next card due. */
function BoardCard({ board, today }: { board: MyWeekBoardSummary; today: string }) {
  const counts = [
    `${board.open} open`,
    board.late ? `${board.late} late` : "",
    board.doing ? `${board.doing} in progress` : "",
    board.done ? `${board.done} done` : "",
  ].filter(Boolean);
  return (
    <li>
      <Link className="admin-myweek-board" href={board.href}>
        <span className="admin-myweek-board-name">{board.name}</span>
        <span className="admin-myweek-board-client">{board.client ?? "Internal"}</span>
        <span className="admin-myweek-board-counts">
          {counts.map((c, i) => (
            <span key={c} className={i === 1 && board.late ? "admin-myweek-board-late" : undefined}>
              {c}
            </span>
          ))}
        </span>
        <span className="admin-myweek-board-next">
          {board.next ? `Next: ${board.next.due === today ? "Today" : nearDate(board.next.due, today)} · ${board.next.title}` : "Nothing else dated"}
        </span>
      </Link>
    </li>
  );
}

function Footer({ model }: { model: MyWeekModel }) {
  const { finished, otherOpen } = model.counts;
  return (
    // A div, not a <footer>: app/globals.css styles every bare `footer` as the
    // marketing site's dark footer.
    <div className="admin-myweek-foot">
      <p className="admin-myweek-foot-line">
        <Link href={FINISHED_HREF}>{finished} finished this sprint</Link>
        {otherOpen > 0 && (
          <>
            {" · "}
            <Link href={WORKBOARD_HREF}>
              {otherOpen} more open outside this sprint
            </Link>
          </>
        )}
        {model.counts.open > 0 && (
          <>
            {" · "}
            {/* The sum is withheld the moment one open card is unsized (W.98),
                and the line says how many instead of leaving a dash. */}
            {model.openTokens === null
              ? `${model.unsized} open ${model.unsized === 1 ? "card is" : "cards are"} not sized`
              : `${formatTokens(model.openTokens)} HT open`}
          </>
        )}
      </p>
      <p className="admin-myweek-foot-line">Only you can see this page. Nothing on it reaches a digest, an export or anyone else.</p>
    </div>
  );
}

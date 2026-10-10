// One line of My Week (W.102.3, redrawn in W.169 and W.171): a card of yours,
// or a blocker that waits on you.
//
// Two lines, on a grid, so every title starts at the same x whatever the row
// carries (2026-10-06 polish research): the title and its date on the first
// line; where it lives, a quiet tag and its size on the second. A tag is
// trailing and never leading, because a leading pill pushes the title along.
//
// ONE ALERT COLOUR. Lateness is the only thing on the page that is wrong, so
// it is the only thing in the error token — and it is written as words ("2d
// late") so it reads without the colour (WCAG 1.4.1). "In progress" and
// "Waiting on you" are facts, not alarms: outlined, in the muted ink. Priority
// is weight, never hue: P1 in the ink, P2 and P3 muted, the letters saying which.
//
// WHAT A ROW SAYS DEPENDS ON ITS SECTION, so the row is told which one it is in
// rather than a flag per word (W.171). A day's rows leave the date out (the
// heading says it); In progress leaves its own tag out (the heading says that
// too); only a day's rows say New. The date is said as words that cannot
// contradict a heading: "due Thu 8", or "after sprint · Fri 30 Oct".
import type { ReactNode } from "react";
import Link from "next/link";
import { formatTokens } from "@/entities/boards/lib/tokens";
import type { MyWeekRow as Row } from "@/entities/boards/lib/my-week";
import { dueWords } from "./my-week-dates";

export type MyWeekSection = "doing" | "today" | "fresh" | "day" | "later" | "undated";

export function MyWeekRow({
  row,
  today,
  endsOn,
  section,
  hidePlace = false,
  action = null,
}: {
  row: Row;
  today: string;
  /** The sprint's last day: a date past it reads "after sprint". */
  endsOn: string;
  section: MyWeekSection;
  /** Every row on the page lives in one place, said once above them (W.171). */
  hidePlace?: boolean;
  /** A control under the row (Give it a day); it cannot sit inside the link. */
  action?: ReactNode;
}) {
  const sub = [row.waitingOn ? `On “${row.waitingOn}”` : "", hidePlace ? "" : row.place].filter(Boolean).join(" · ");
  const showDate = section !== "day" && section !== "undated";
  const when =
    row.lateDays > 0 ? (
      <span className="admin-myweek-late">{row.lateDays}d late</span>
    ) : showDate ? (
      <span className="admin-myweek-due">{row.due ? dueWords(row.due, today, endsOn) : "No date"}</span>
    ) : null;

  const body = (
    <>
      <span className={`admin-myweek-pri${row.priority === "p1" ? " is-lead" : ""}`}>{row.priority.toUpperCase()}</span>
      <span className="admin-myweek-title">{row.title}</span>
      <span className="admin-myweek-when">{when}</span>
      <span className="admin-myweek-sub">{sub}</span>
      <span className="admin-myweek-meta">
        {row.doing && section !== "doing" && <span className="admin-myweek-tag">In progress</span>}
        {row.fresh && section === "day" && <span className="admin-myweek-tag">New</span>}
        {row.waitingOn !== null && <span className="admin-myweek-tag">Waiting on you</span>}
        {/* The sprint it came from, which says what "carried" only implied. */}
        {row.carried && <span className="admin-myweek-from">{row.carriedFrom ? `from ${row.carriedFrom}` : "Carried"}</span>}
        {row.ht !== null && <span className="admin-myweek-ht">{formatTokens(row.ht)} HT</span>}
      </span>
    </>
  );

  // A card whose board did not come back has nowhere to link to; it is still
  // listed, because a week that quietly drops work is worse than a row that
  // cannot be clicked.
  return (
    <li>
      {row.href ? (
        <Link className="admin-myweek-row" href={row.href}>
          {body}
        </Link>
      ) : (
        <div className="admin-myweek-row">{body}</div>
      )}
      {action}
    </li>
  );
}

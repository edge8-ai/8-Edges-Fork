"use client";

// "Past their date" on the team Inbox (TH.8): the routine's due reminders,
// quiet and below the asks. They never add to the sidebar's count.
//
// Grouped so twenty-two near-identical rows read as what they are: by the date
// each card was due (a tally per date up top), and within a date under the
// card a subtask belongs to. Nothing folds; the list sits in a box of bounded
// height that scrolls inside (Khoa, 18 Oct: "else it will run to infinite"),
// and Clear all, or Clear these for one date, takes reminders off with Undo.
// A reminder about a card that is no longer work is not shown at all, and the
// line under the tallies says which went.
//
// No hooks here: the page owns what a click does (use-inbox-actions).
import { Icon } from "@/kernel/ui/Icon";
import { openWith } from "./open-in-place";
import type { DueDate, DueRow } from "./team-inbox";

const cards = (n: number) => `${n} ${n === 1 ? "card" : "cards"}`;

/** A card by its board number when its title opens with one ("R.5.2 Apply the seed" → "R.5.2"). */
const short = (title: string) => /^([A-Z]{1,4}\.\d+(?:\.\d+)*)\s/.exec(title)?.[1] ?? title;

function names(titles: string[]): string {
  // Five names read as a sentence; past that, the first four and how many more.
  const shown = (titles.length <= 5 ? titles : titles.slice(0, 4)).map(short);
  const rest = titles.length - shown.length;
  return rest > 0 ? `${shown.join(", ")} and ${rest} more` : shown.join(", ").replace(/, ([^,]*)$/, " and $1");
}

export function TeamInboxReminders({
  dates,
  dueIds,
  cleared,
  myWeekHref,
  pending,
  onOpen,
  onClear,
}: {
  dates: DueDate[];
  dueIds: string[];
  cleared: string[];
  /** Where new dates are picked; null where the page has no My week. */
  myWeekHref: string | null;
  pending: boolean;
  onOpen: (row: DueRow) => (href: string) => void;
  onClear: (ids: string[], text: string) => void;
}) {
  const row = (r: DueRow, icon: "calendar" | "checklist") => (
    <div key={r.ids[0]} className={`ti-due${r.unread ? " is-unread" : ""}`} data-inbox-row="">
      <span className="ti-due-ico" aria-hidden="true">
        <Icon name={icon} />
      </span>
      {r.href ? (
        <a className="ti-link" href={r.href} data-inbox-open="" onClick={openWith(r.href, onOpen(r))}>
          <span className="ti-due-t">{r.title}</span>
        </a>
      ) : (
        <span className="ti-due-t">{r.title}</span>
      )}
      <button type="button" className="ti-icbtn ti-clear" data-inbox-done="" aria-label={`Clear the reminder for ${r.title}`} title="Clear (E)" disabled={pending} onClick={() => onClear(r.ids, "Reminder cleared")}>
        <Icon name="check" />
      </button>
    </div>
  );

  return (
    <section className="ti-card ti-sec" aria-labelledby="ti-dates-h">
      <div className="ti-sec-head">
        <div>
          <p className="ti-k">Reminders</p>
          <h2 className="ti-h" id="ti-dates-h">
            Past their date
          </h2>
        </div>
        <div className="ti-acts">
          <span className="ti-pill ti-pill-calm">{cards(dueIds.length)}</span>
          {dueIds.length > 0 && (
            <button type="button" className="ti-btn ti-btn-ghost" disabled={pending} onClick={() => onClear(dueIds, `Cleared ${dueIds.length} reminders`)}>
              Clear all {dueIds.length}
            </button>
          )}
        </div>
      </div>
      {dates.length === 0 ? (
        <p className="ti-empty-p">Every card of yours is on time. Nice and quiet.</p>
      ) : (
        <>
          <p className="ti-intro">These slipped past the date they were given. Open one to finish it or give it a new date. They never add to the count on Inbox.</p>
          <ul className="ti-tallies" aria-label="Cards by the date they were due">
            {dates.map((d) => (
              <li key={d.day} className="ti-tally">
                <span className="ti-leaf" aria-hidden="true">
                  <span className="ti-leaf-dow">{d.dow}</span>
                  <span className="ti-leaf-dd">{d.dd}</span>
                </span>
                <span>
                  <span className="ti-tally-n">{cards(d.ids.length)}</span>
                  <span className="ti-tally-l">due {d.label}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {cleared.length > 0 && (
        <p className="ti-cleared">
          <Icon name="check" />
          {cleared.length === 1 ? "1 reminder cleared itself" : `${cleared.length} reminders cleared themselves`}: {names(cleared)} {cleared.length === 1 ? "is" : "are"} done or set aside.
        </p>
      )}
      {dates.length > 0 && (
        // Focusable so the box scrolls from the keyboard (WCAG 2.1.1), and named for a screen reader.
        <div className="ti-box" tabIndex={0} role="region" aria-label="Cards past their date">
          {dates.map((d) => (
            <div key={d.day} className="ti-date">
              <div className="ti-date-head">
                <h3 className="ti-date-h">
                  Due {d.label}
                  <span className="ti-date-n">{cards(d.ids.length)}</span>
                </h3>
                <div className="ti-acts">
                  {myWeekHref && (
                    <a className="ti-btn ti-btn-ghost" href={myWeekHref}>
                      Pick new dates
                    </a>
                  )}
                  <button type="button" className="ti-btn ti-btn-ghost" disabled={pending} onClick={() => onClear(d.ids, `Cleared ${d.ids.length} from ${d.label}`)}>
                    Clear these {d.ids.length}
                  </button>
                </div>
              </div>
              {d.clusters.map((c) => (
                <div key={c.key}>
                  {c.head ? (
                    row(c.head, "calendar")
                  ) : (
                    <p className="ti-parent">
                      <Icon name="columns" />
                      Subtasks of {c.title}
                    </p>
                  )}
                  {c.kids.length > 0 && <div className="ti-kids">{c.kids.map((k) => row(k, "checklist"))}</div>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

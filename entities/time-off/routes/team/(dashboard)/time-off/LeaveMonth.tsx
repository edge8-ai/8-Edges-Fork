"use client";

import { MonthGrid } from "@/kernel/ui/MonthGrid";
import { initials } from "@/kernel/ui/format";
import { isWeekendIso, longDay, shortDay, typeLabel } from "./time-off-bits";

type Own = { type: string; pending: boolean };

// The employee's month (TH.6): their own leave by type, the company's
// holidays, the day a posting lands and the last day to use this year's days,
// and who else is out — names only, never why. A day is a button that opens
// the day panel beside the calendar.
export function LeaveMonth({
  today,
  selected,
  onPick,
  holidays,
  closed,
  outs,
  own,
  nextPost,
  useBy,
}: {
  today: string;
  selected: string;
  onPick: (iso: string) => void;
  holidays: Record<string, string>;
  closed: string[];
  outs: Record<string, string[]> | null;
  own: Record<string, Own>;
  nextPost: string | null;
  useBy: string | null;
}) {
  const closedSet = new Set(closed);
  return (
    <div className="to-card to-cal">
      <MonthGrid
        today={today}
        selectedIso={selected}
        onDayClick={onPick}
        dayClassName={(iso) => [closedSet.has(iso) ? "is-hol" : "", own[iso] ? "is-mine" : ""].filter(Boolean).join(" ") || undefined}
        dayLabel={(iso) => {
          const parts = [longDay(iso)];
          if (holidays[iso]) parts.push(holidays[iso]);
          if (own[iso]) parts.push(`your ${typeLabel(own[iso].type).toLowerCase()}${own[iso].pending ? ", waiting" : ""}`);
          const n = outs?.[iso]?.length ?? 0;
          if (n) parts.push(`${n} out`);
          return parts.join(", ");
        }}
        renderDay={(iso) => {
          const mine = own[iso];
          const names = outs?.[iso] ?? [];
          const tag = holidays[iso]
            ? <span className="to-day-tag to-tag-hol">{holidays[iso]}</span>
            : mine
              ? <span className={`to-day-tag to-tag-mine c-${mine.type}${mine.pending ? " is-pending" : ""}`}>{typeLabel(mine.type)}</span>
              : iso === nextPost
                ? <span className="to-day-tag to-tag-next">+1 day</span>
                : iso === useBy
                  ? <span className="to-day-tag to-tag-last">Last day to use</span>
                  : null;
          if (!tag && names.length === 0) return null;
          return (
            <span className="to-cell-foot" aria-hidden="true">
              {tag}
              {names.length > 0 && (
                <span className="to-outs">
                  {names.slice(0, 2).map((n) => <span key={n} className="to-av">{initials(n)}</span>)}
                  {names.length > 2 && <span className="to-av to-av-more">+{names.length - 2}</span>}
                </span>
              )}
            </span>
          );
        }}
        legend={
          <>
            <span className="to-key"><span className="to-key-dot to-key-today" />Today</span>
            <span className="to-key"><span className="to-key-dot to-key-post" />A day added to your balance</span>
            <span className="to-key"><span className="to-key-dot to-key-hol" />Public holiday</span>
            <span className="to-key"><span className="to-key-dot to-key-out" />A teammate is out</span>
          </>
        }
      />
    </div>
  );
}

export function DayPanel({
  iso,
  today,
  windowFrom,
  windowTo,
  holiday,
  closed,
  outs,
  own,
  isNextPost,
  isUseBy,
  onRequest,
}: {
  iso: string;
  today: string;
  windowFrom: string;
  windowTo: string;
  holiday: string | null;
  closed: boolean;
  outs: string[] | null;
  own: Own | null;
  isNextPost: boolean;
  isUseBy: boolean;
  /** Null when the viewer may not ask for time off: the button is not drawn. */
  onRequest: (() => void) | null;
}) {
  const inWindow = iso >= windowFrom && iso <= windowTo;
  const notes: string[] = [];
  if (isNextPost) notes.push("A posting lands in your balance today.");
  if (isUseBy) notes.push("The last day to use this year's days.");
  if (isWeekendIso(iso) && !own) notes.push("A weekend: a request for it uses no days.");
  if (!inWindow) notes.push(`Who is out shows from ${shortDay(windowFrom)} to ${shortDay(windowTo)}.`);
  else if (outs && outs.length === 0 && iso === today && !closed && !isWeekendIso(iso)) notes.push("Everyone is in today.");

  return (
    <section className="to-card to-panel" aria-live="polite">
      <p className="to-panel-k">{iso === today ? "Today" : "Selected day"}</p>
      <h2 className="to-panel-h">{longDay(iso)}</h2>
      {holiday && <p className="to-panel-hol">{holiday}{closed ? " · office closed" : ""}</p>}
      {own && (
        <p className={`to-panel-own c-${own.type}`}>
          <span className="to-tdot" />You are off: {typeLabel(own.type)}{own.pending ? " · waiting for approval" : ""}
        </p>
      )}
      {outs && outs.length > 0 && (
        <>
          <p className="to-panel-k to-panel-k-gap">Out this day</p>
          <ul className="to-panel-list">
            {outs.map((n) => (
              <li key={n}><span className="to-av">{initials(n)}</span>{n}</li>
            ))}
          </ul>
        </>
      )}
      {notes.map((n) => <p key={n} className="to-panel-note">{n}</p>)}
      {onRequest && <button type="button" className="to-ghost" onClick={onRequest}>Request this day off</button>}
    </section>
  );
}

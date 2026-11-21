"use client";

import { useState, type ReactNode } from "react";
import { ViewToggle } from "@/kernel/ui/ViewToggle";
import type { MayProp } from "@/kernel/identity/may-prop";
import type { BalanceFacts, OwnLeaveRow } from "@/entities/time-off/lib/time-off-view";
import { LeaveMonth, DayPanel } from "./LeaveMonth";
import { MyRequests, RequestList } from "./MyRequests";
import { RequestSheet } from "./RequestSheet";
import { shortDay, SunIcon } from "./time-off-bits";

export type LeaveRing = { type: string; label: string; value: string; fraction: number | null; sub: string };

export type TimeOffHomeProps = {
  /** Whether the viewer may ask for and cancel their own leave (time-off.mine). */
  may: MayProp;
  today: string;
  windowFrom: string;
  windowTo: string;
  facts: BalanceFacts | null;
  rings: LeaveRing[];
  holidays: Record<string, string>;
  closedDates: string[];
  outs: Record<string, string[]> | null;
  own: Record<string, { type: string; pending: boolean }>;
  rows: OwnLeaveRow[];
  autoApprove: boolean;
  bankTypes: string[];
  policyView: ReactNode;
};

const RING_C = 2 * Math.PI * 26;

// The employee's Time Off page (TH.6, approved on the canvas on 18 Oct 2026):
// the balance and what is coming on top, a ring per leave type, the calendar
// with holidays and who else is out, a day panel and the requests, and one
// sheet to ask for time off. Every figure arrives computed from the server.
export function TimeOffHome(p: TimeOffHomeProps) {
  const [selected, setSelected] = useState(p.today);
  const [sheet, setSheet] = useState<{ start: string; end: string } | null>(null);
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const f = p.facts;
  const canAsk = p.may["time-off.mine"] === true;
  const fullSuns = f ? Math.max(0, Math.min(6, Math.floor(f.available))) : 0;

  const views = [
    {
      key: "calendar",
      label: "Calendar",
      content: (
        <LeaveMonth
          today={p.today}
          selected={selected}
          onPick={setSelected}
          holidays={p.holidays}
          closed={p.closedDates}
          outs={p.outs}
          own={p.own}
          nextPost={f?.next?.date ?? null}
          useBy={f?.useBy?.date ?? null}
        />
      ),
    },
    { key: "list", label: "List", content: <div className="to-card to-panel"><RequestList may={p.may} rows={p.rows} closed={p.closedDates} onDone={setBanner} /></div> },
    ...(p.policyView ? [{ key: "policy", label: "Policy", content: p.policyView }] : []),
  ];

  return (
    <div className="to-home">
      {banner && <div className={`admin-alert admin-alert--${banner.tone}`} role="status">{banner.text}</div>}

      <section className="to-hero" aria-label="Your time off balance">
        <div className="to-bal">
          {f && (
            <div className="to-suns" aria-hidden="true">
              {Array.from({ length: fullSuns }, (_, i) => (
                <span key={i} className="to-sun-wrap"><SunIcon className="to-sun to-sun-on" /></span>
              ))}
              {f.next && (
                <span className="to-sun-wrap">
                  <SunIcon className="to-sun to-sun-next" />
                  <span className="to-sun-cap">{shortDay(f.next.date)}</span>
                </span>
              )}
            </div>
          )}
          <div className="u-min-0">
            {f ? (
              <p className="to-big">
                <span className="to-big-n">{f.available}</span>
                <span className="to-big-l">{f.available === 1 ? "day off available" : "days off available"}</span>
                <span className="to-big-h">{f.hoursAvailable} h</span>
              </p>
            ) : (
              <p className="to-big"><span className="to-big-l">Request and track your leave.</span></p>
            )}
            {f && (
              <ul className="to-facts">
                {f.next && <li className="to-fact"><b>+{f.next.days} day{f.next.days === 1 ? "" : "s"}</b> on {shortDay(f.next.date)}</li>}
                <li className="to-fact">Earned <b>{f.earned}</b> this year · {f.carriedIn} carried in + {f.accrued} accrued</li>
                <li className="to-fact">Taken <b>{f.taken}</b></li>
                {f.booked > 0 && <li className="to-fact"><b>{f.booked}</b> booked ahead</li>}
                {f.pending > 0 && <li className="to-fact"><b>{f.pending}</b> waiting for approval</li>}
                {f.available < 0 && <li className="to-fact to-fact-warn">Taken or booked ahead of what has accrued</li>}
                {f.useBy && (
                  <li className="to-fact to-fact-warn">
                    Use by <b>{shortDay(f.useBy.date)}</b> · {f.useBy.atRiskDays} day{f.useBy.atRiskDays === 1 ? "" : "s"} would be lost
                    {f.carriesOver ? "" : `, nothing carries into ${Number(f.useBy.date.slice(0, 4)) + 1}`}
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
        {canAsk && (
          <button type="button" className="to-cta" onClick={() => setSheet({ start: p.today, end: p.today })}>
            <span aria-hidden="true">+</span> Request day off
          </button>
        )}
      </section>

      {p.rings.length > 0 && (
        <section className="to-rings" aria-label="Your leave by type">
          {p.rings.map((r) => (
            <div key={r.type} className={`to-card to-ring c-${r.type}`}>
              <svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label={`${r.label}: ${r.sub}`}>
                <circle className="to-ring-track" cx="32" cy="32" r="26" fill="none" strokeWidth="7" />
                {r.fraction !== null && r.fraction > 0 && (
                  <circle className="to-ring-arc" cx="32" cy="32" r="26" fill="none" strokeWidth="7" strokeLinecap="round"
                    strokeDasharray={`${(RING_C * r.fraction).toFixed(1)} ${RING_C.toFixed(1)}`} transform="rotate(-90 32 32)" />
                )}
                <text className="to-ring-v" x="32" y="37" textAnchor="middle">{r.value}</text>
              </svg>
              <div className="u-min-0">
                <p className="to-ring-t"><span className="to-tdot" />{r.label}</p>
                <p className="to-ring-s">{r.sub}</p>
              </div>
            </div>
          ))}
        </section>
      )}

      <div className="to-grid">
        <div className="to-main"><ViewToggle views={views} /></div>
        <aside className="to-side">
          <DayPanel
            iso={selected}
            today={p.today}
            windowFrom={p.windowFrom}
            windowTo={p.windowTo}
            holiday={p.holidays[selected] ?? null}
            closed={p.closedDates.includes(selected)}
            outs={p.outs ? (p.outs[selected] ?? []) : null}
            own={p.own[selected] ?? null}
            isNextPost={f?.next?.date === selected}
            isUseBy={f?.useBy?.date === selected}
            onRequest={canAsk ? () => setSheet({ start: selected, end: selected }) : null}
          />
          <MyRequests may={p.may} rows={p.rows} closed={p.closedDates} onDone={setBanner} />
        </aside>
      </div>

      {/* Keyed by the day it opens for, so each opening starts fresh from that
          day (the button: today; the day panel: the picked day) rather than
          from the last request's leftovers. */}
      {canAsk && (
      <RequestSheet
        may={p.may}
        key={sheet ? `${sheet.start}:${sheet.end}` : "closed"}
        open={sheet !== null}
        initial={sheet}
        onClose={() => setSheet(null)}
        onDone={(b) => {
          setBanner(b);
          if (b.tone === "ok") setSheet(null);
        }}
        autoApprove={p.autoApprove}
        bankTypes={p.bankTypes}
        closed={p.closedDates}
      />
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { LEAVE_TYPES, LEAVE_TYPE_LABEL, countWorkingDays } from "@/entities/time-off/client";
import { requestOwnTimeOff } from "./actions";
import type { MayProp } from "@/kernel/identity/may-prop";

type Banner = { tone: "ok" | "err"; text: string };

// The illustrated band at the top of the sheet: a day at the beach. Shapes
// only; every colour comes from the stylesheet's tokens.
function BeachArt() {
  return (
    <svg className="to-art" viewBox="0 0 460 104" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect className="to-art-sky" width="460" height="66" />
      <rect className="to-art-sand" y="66" width="460" height="38" />
      <path className="to-art-sea" d="M0 66c40-8 80 8 120 0s80-8 120 0 80 8 120 0 70-8 100 0v-6H0z" />
      <circle className="to-art-sun" cx="388" cy="30" r="14" />
      <path className="to-art-rays" d="M388 8v6M388 46v6M366 30h6M404 30h6M372 14l4 4M400 42l4 4M372 46l4-4M400 18l4-4" strokeWidth="2.4" strokeLinecap="round" />
      <path className="to-art-umbrella" d="M150 44c22-26 74-26 96 0z" />
      <path className="to-art-pole" d="M198 22v66" strokeWidth="3" strokeLinecap="round" />
      <rect className="to-art-towel" x="222" y="78" width="56" height="11" rx="5.5" />
      <circle className="to-art-ball" cx="296" cy="84" r="8" />
      <path className="to-art-bird" d="M86 28c4-4 8-4 12 0M100 22c3-3 6-3 9 0" fill="none" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function RequestSheet({
  may,
  open,
  initial,
  onClose,
  onDone,
  autoApprove,
  bankTypes,
  closed,
}: {
  /** The sheet's submit follows time-off.mine; its parent only opens it when held. */
  may: MayProp;
  open: boolean;
  initial: { start: string; end: string } | null;
  onClose: () => void;
  onDone: (b: Banner) => void;
  autoApprove: boolean;
  bankTypes: string[];
  closed: string[];
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [leaveType, setLeaveType] = useState<string>(bankTypes[0] ?? "vacation");
  const [startDate, setStartDate] = useState(initial?.start ?? "");
  const [endDate, setEndDate] = useState(initial?.end ?? "");
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [reason, setReason] = useState("");

  const count = startDate && endDate ? countWorkingDays(startDate, endDate, isHalfDay, closed) : 0;
  // No days-left figure here (TH.26): leave is not capped at the balance, and a
  // count of what remains read as a limit. The balance card on the page says
  // what has accrued; the sheet only says whether this type draws on it.
  const fromBank = bankTypes.includes(leaveType);
  const steps = autoApprove
    ? ["Your request", "Approved automatically by your policy", "Your manager and ops are told"]
    : ["Your request", "Reviewed by ops", "Booked once approved"];

  function submit() {
    start(async () => {
      const res = await requestOwnTimeOff({ leaveType, startDate, endDate, isHalfDay, reason });
      if (res.ok) {
        onDone({ tone: "ok", text: res.autoApproved ? "Approved — your time off is booked." : "Request submitted for approval." });
        router.refresh();
      } else onDone({ tone: "err", text: res.error });
    });
  }

  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      title="Request day off"
      className="to-sheet"
      subhead={
        <div className="to-sheet-top">
          <BeachArt />
          <ol className="to-steps" aria-label="What happens next">
            {steps.map((s, i) => (
              <li key={s} className={`to-step${i === 0 ? " is-on" : ""}${i === 1 && autoApprove ? " is-auto" : ""}`}>
                <span className="to-step-bar" aria-hidden="true" />
                {s}
              </li>
            ))}
          </ol>
        </div>
      }
      footer={
        <div className="to-sheet-foot">
          <button type="button" className="admin-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="admin-btn admin-btn--primary" disabled={busy || !startDate || !endDate || !may["time-off.mine"]} onClick={submit}>
            {busy ? "Saving…" : "Submit request"}
          </button>
        </div>
      }
    >
      <div className="to-sheet-body">
        <div>
          <p className="to-label" id="to-type-l">Leave type</p>
          <div className="to-types" role="radiogroup" aria-labelledby="to-type-l">
            {LEAVE_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={leaveType === t}
                className={`to-type c-${t}${leaveType === t ? " is-on" : ""}`}
                onClick={() => setLeaveType(t)}
              >
                <span className="to-tdot" aria-hidden="true" />
                {LEAVE_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>
        <div className="to-dates">
          <label className="to-field">
            Start date
            <input className="admin-input" type="date" value={startDate} required
              onChange={(e) => {
                setStartDate(e.target.value);
                if (endDate < e.target.value || isHalfDay) setEndDate(e.target.value);
              }} />
          </label>
          <label className="to-field">
            End date
            <input className="admin-input" type="date" value={endDate} min={startDate} disabled={isHalfDay} required onChange={(e) => setEndDate(e.target.value)} />
          </label>
        </div>
        <label className="to-check">
          <input type="checkbox" checked={isHalfDay}
            onChange={(e) => {
              setIsHalfDay(e.target.checked);
              if (e.target.checked) setEndDate(startDate);
            }} />
          Half day
        </label>
        <div className="to-count" aria-live="polite">
          <div>
            <div className="to-count-n">{count}</div>
            <div className="to-count-l">{count === 1 ? "working day" : count === 0 ? "working days · weekends and holidays are free" : "working days"}</div>
          </div>
          <div className="to-count-r">
            {fromBank ? "Taken from your balance" : "Not taken from your balance"}
          </div>
        </div>
        <label className="to-field">
          Reason (optional)
          <textarea className="admin-textarea" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      </div>
    </DetailDrawer>
  );
}

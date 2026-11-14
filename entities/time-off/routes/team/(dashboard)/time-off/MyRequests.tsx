"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import { countWorkingDays, formatDays, statusTone } from "@/entities/time-off/client";
import type { OwnLeaveRow } from "@/entities/time-off/lib/time-off-view";
import type { MayProp } from "@/kernel/identity/may-prop";
import { cancelOwnTimeOff } from "./actions";
import { SunIcon, typeLabel } from "./time-off-bits";

type Banner = { tone: "ok" | "err"; text: string };

// One request as a card: its type, dates, length and status, and Cancel while
// it is still waiting or booked. Cancelling goes through the same scoped
// action the old table used.
function RequestCard({ may, r, closed, onDone }: { may: MayProp; r: OwnLeaveRow; closed: string[]; onDone: (b: Banner) => void }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const days = r.days ?? countWorkingDays(r.startDate, r.endDate, r.isHalfDay, closed);
  const range =
    r.startDate === r.endDate
      ? formatDate(r.startDate) + (r.isHalfDay ? " (half)" : "")
      : `${formatDate(r.startDate)} → ${formatDate(r.endDate)}`;
  return (
    <li className={`to-req c-${r.leaveType}`}>
      <span className="to-tdot" aria-hidden="true" />
      <div className="u-min-0 to-req-body">
        <p className="to-req-t">{typeLabel(r.leaveType)} · {days > 0 ? formatDays(days) : "no working days"}</p>
        <p className="to-req-s">{range}{r.reason ? ` · ${r.reason}` : ""}</p>
      </div>
      <Badge tone={statusTone(r.status)}>{r.status}</Badge>
      {may["time-off.mine"] && (r.status === "requested" || r.status === "approved") && (
        <button
          type="button"
          className="admin-btn admin-btn--sm"
          disabled={busy}
          onClick={() =>
            start(async () => {
              const res = await cancelOwnTimeOff(r.id);
              if (res.ok) {
                onDone({ tone: "ok", text: "Request cancelled." });
                router.refresh();
              } else onDone({ tone: "err", text: res.error });
            })
          }
        >
          Cancel
        </button>
      )}
    </li>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="to-req-empty">
      <SunIcon className="to-empty-sun" />
      {text}
    </div>
  );
}

/** Every request, newest first: the List view. */
export function RequestList({ may, rows, closed, onDone }: { may: MayProp; rows: OwnLeaveRow[]; closed: string[]; onDone: (b: Banner) => void }) {
  if (rows.length === 0) return <Empty text="No time off requests yet." />;
  return (
    <ul className="to-req-list">
      {rows.map((r) => <RequestCard key={r.id} may={may} r={r} closed={closed} onDone={onDone} />)}
    </ul>
  );
}

/** The side panel: waiting requests apart from the ones already decided. */
export function MyRequests({ may, rows, closed, onDone }: { may: MayProp; rows: OwnLeaveRow[]; closed: string[]; onDone: (b: Banner) => void }) {
  const pending = rows.filter((r) => r.status === "requested");
  const history = rows.filter((r) => r.status !== "requested");
  const [tab, setTab] = useState<"pending" | "history">(pending.length > 0 || history.length === 0 ? "pending" : "history");
  const shown = tab === "pending" ? pending : history;
  return (
    <section className="to-card to-panel" aria-labelledby="to-req-h">
      <h2 className="to-panel-h" id="to-req-h">My requests</h2>
      <div className="to-reqtabs" role="tablist" aria-label="My requests">
        <button type="button" role="tab" aria-selected={tab === "pending"} className={tab === "pending" ? "is-on" : ""} onClick={() => setTab("pending")}>
          Pending<b>{pending.length}</b>
        </button>
        <button type="button" role="tab" aria-selected={tab === "history"} className={tab === "history" ? "is-on" : ""} onClick={() => setTab("history")}>
          History<b>{history.length}</b>
        </button>
      </div>
      {shown.length === 0 ? (
        <Empty text={tab === "pending" ? "Nothing waiting." : "No time off taken yet."} />
      ) : (
        <ul className="to-req-list">
          {shown.map((r) => <RequestCard key={r.id} may={may} r={r} closed={closed} onDone={onDone} />)}
        </ul>
      )}
    </section>
  );
}

"use client";

import { MonthGrid } from "@/kernel/ui/MonthGrid";
import { LEAVE_TYPE_LABEL, type LeaveType } from "../lib/leave";
import { formatDate } from "@/kernel/ui/format";

// Month-grid calendar for time off, shared by /portal, /team and /admin (each
// takes it from the team's client door; it was company-os's until Q2). Pure
// presentation: it renders exactly the entries it is given, so each surface's
// existing data helper (and its privacy scope) stays the single source of what
// is visible. Approved/taken leave renders solid, pending renders outlined.
//
// The grid itself — the month head, the Monday-first cells, the weekend shading
// and today's marker — moved to kernel/ui/MonthGrid for W.28, which needed the
// same month for the Workboard's due dates. What stays here is what is true of
// LEAVE and of nothing else: which statuses plot, and what a chip says.
export type CalendarEntry = {
  id: string;
  // Person label for the chip. Null on own-leave surfaces (/team), where the
  // leave type is the useful label instead.
  name: string | null;
  leaveType: string;
  status: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  isHalfDay: boolean;
};

// Only these statuses represent real absence; rejected/cancelled never plot.
const PLOTTED = new Set(["requested", "approved", "taken"]);

function leaveTypeLabel(type: string): string {
  return LEAVE_TYPE_LABEL[type as LeaveType] ?? type;
}

export function TimeOffCalendar({ entries }: { entries: CalendarEntry[] }) {
  const plotted = entries.filter((e) => PLOTTED.has(e.status));

  return (
    <MonthGrid
      legend={
        <>
          <span className="admin-cal-chip is-ok">Approved</span>
          <span className="admin-cal-chip is-warn">Pending</span>
        </>
      }
      renderDay={(iso) =>
        plotted
          .filter((e) => e.startDate <= iso && e.endDate >= iso)
          .map((e) => {
            const range = e.startDate === e.endDate ? formatDate(e.startDate) : `${formatDate(e.startDate)} → ${formatDate(e.endDate)}`;
            const person = e.name ? `${e.name} · ` : "";
            return (
              <span
                key={e.id}
                className={`admin-cal-chip ${e.status === "requested" ? "is-warn" : "is-ok"}`}
                title={`${person}${leaveTypeLabel(e.leaveType)} · ${range}${e.isHalfDay ? " · half day" : ""} · ${e.status === "requested" ? "pending" : e.status}`}
              >
                {e.name ?? leaveTypeLabel(e.leaveType)}
                {e.isHalfDay ? " ·½" : ""}
              </span>
            );
          })
      }
    />
  );
}

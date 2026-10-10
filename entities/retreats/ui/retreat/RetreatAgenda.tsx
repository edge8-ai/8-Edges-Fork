import {
  groupAgendaByDay,
  PERIOD_LABELS,
  STAFF_ROLE_LABELS,
  type AgendaBlock,
} from "@/entities/retreats/lib/event-agenda-shared";

// Shared, presentational agenda renderer used in two places from one data
// source (docs/plans/2026-07-31-my-retreat-design.md):
//   view="guest" → the "My Retreat" itinerary. Guest-visible blocks only,
//                  staff hidden.
//   view="ops"   → the internal work schedule. Every block, plus who works it.
// Self-contained inline styles so it renders the same inside the admin console
// and the marketing hub. No client hooks — safe as a server component.

const timeStyle: React.CSSProperties = {
  fontFamily: "var(--admin-font-mono)",
  fontSize: 13,
  letterSpacing: "0.02em",
  color: "var(--admin-muted)",
};

export function RetreatAgenda({ blocks, view }: { blocks: AgendaBlock[]; view: "guest" | "ops" }) {
  const days = groupAgendaByDay(blocks, view);
  if (days.length === 0) {
    return <p className="u-m-0 u-dim-2">No agenda yet.</p>;
  }

  return (
    <div className="u-stack ">
      {days.map((day) => (
        <section key={day.dayIndex}>
          <header className="u-row u-gap-3 u-mb-2">
            <span
              aria-hidden
              className="admin-dot"
            />
            <div className="admin-h-md">
              {day.dayLabel || `Day ${day.dayIndex}`}
            </div>
            {!day.dayLabel && day.dayDate && <div style={timeStyle}>{formatDay(day.dayDate)}</div>}
          </header>

          <div className="u-stack">
            {day.blocks.map((b) => (
              <div
                key={b.id}
                className="admin-agenda-row"
              >
                <div className="u-stack">
                  <span style={timeStyle}>{timeText(b)}</span>
                  {view === "ops" && b.staff.length > 0 && (
                    <div className="u-row u-wrap">
                      {b.staff.map((s) => (
                        <span
                          key={s.id}
                          title={STAFF_ROLE_LABELS[s.role]}
                          className="admin-tag-pill"
                        >
                          {s.personName ?? "Unknown"} · {STAFF_ROLE_LABELS[s.role]}
                        </span>
                      ))}
                    </div>
                  )}
                  {view === "ops" && !b.guestVisible && (
                    <span className="u-xs u-muted">ops only</span>
                  )}
                </div>

                <div>
                  <div className="u-strong">{b.title}</div>
                  {b.body && <p className="u-m-0 u-mt-1">{b.body}</p>}
                  {b.room && (
                    <div className="u-mt-1">Room: {b.room}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function timeText(b: AgendaBlock): string {
  if (b.timeLabel) return b.timeLabel;
  if (b.period) return PERIOD_LABELS[b.period];
  return "";
}

function formatDay(date: string): string {
  const t = Date.parse(date.slice(0, 10));
  if (Number.isNaN(t)) return date;
  return new Date(t).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

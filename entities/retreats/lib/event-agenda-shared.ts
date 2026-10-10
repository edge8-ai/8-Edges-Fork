// Client-safe types, constants, labels, and the pure day-grouping helper for
// the retreat agenda. No server-only imports here (event-agenda.ts, which pulls
// in the service-role client, re-exports everything from this file), so the
// Agenda tab client component and the shared RetreatAgenda renderer can import
// from here without dragging secrets into the bundle.

export const AGENDA_PERIODS = ["morning", "afternoon", "evening"] as const;
export type AgendaPeriod = (typeof AGENDA_PERIODS)[number];

export const AGENDA_STAFF_ROLES = ["lead", "engineer", "driver", "maid", "host", "other"] as const;
export type AgendaStaffRole = (typeof AGENDA_STAFF_ROLES)[number];

export const PERIOD_LABELS: Record<AgendaPeriod, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

export const STAFF_ROLE_LABELS: Record<AgendaStaffRole, string> = {
  lead: "Lead",
  engineer: "Engineer",
  driver: "Driver",
  maid: "Housekeeping",
  host: "Host",
  other: "Other",
};

export type AgendaStaff = {
  id: string;
  personId: string;
  personName: string | null;
  role: AgendaStaffRole;
  note: string | null;
};

export type AgendaBlock = {
  id: string;
  eventId: string;
  dayIndex: number;
  dayLabel: string | null;
  dayDate: string | null;
  period: AgendaPeriod | null;
  timeLabel: string | null;
  title: string;
  body: string | null;
  room: string | null;
  guestVisible: boolean;
  sortOrder: number;
  staff: AgendaStaff[];
};

export type AgendaBlockInput = {
  dayIndex: number;
  dayLabel?: string | null;
  dayDate?: string | null;
  period?: AgendaPeriod | null;
  timeLabel?: string | null;
  title: string;
  body?: string | null;
  room?: string | null;
  guestVisible?: boolean;
  sortOrder?: number;
};

export type AgendaDay = {
  dayIndex: number;
  dayLabel: string | null;
  dayDate: string | null;
  blocks: AgendaBlock[];
};

// Pure: group blocks into ordered days. `view: "guest"` drops non-guest-visible
// blocks (and callers must also strip staff before sending to the guest hub).
export function groupAgendaByDay(blocks: AgendaBlock[], view: "guest" | "ops" = "ops"): AgendaDay[] {
  const source = view === "guest" ? blocks.filter((b) => b.guestVisible) : blocks;
  const byDay = new Map<number, AgendaDay>();
  for (const b of source) {
    let day = byDay.get(b.dayIndex);
    if (!day) {
      day = { dayIndex: b.dayIndex, dayLabel: b.dayLabel, dayDate: b.dayDate, blocks: [] };
      byDay.set(b.dayIndex, day);
    }
    if (!day.dayLabel && b.dayLabel) day.dayLabel = b.dayLabel;
    if (!day.dayDate && b.dayDate) day.dayDate = b.dayDate;
    day.blocks.push(b);
  }
  const days = Array.from(byDay.values()).sort((a, b) => a.dayIndex - b.dayIndex);
  for (const d of days) d.blocks.sort((a, b) => a.sortOrder - b.sortOrder);
  return days;
}

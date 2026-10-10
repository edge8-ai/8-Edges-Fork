import { addDays, dateMs } from "@/kernel/config/dates";
import { formatLabel } from "./session-done";

// The roster's week at a glance (K.80): Monday to Friday of this week, and on
// each day the sessions on it — held, booked, or proposed by the employee and
// waiting on the coach. A coach opening the page on Monday sees the shape of
// their week before reading a row. Days only, people by name, nothing counted
// against anybody.

export type WeekItemKind = "held" | "booked" | "proposed";
export type WeekItem = {
  profileId: string;
  name: string;
  avatarUrl: string | null;
  kind: WeekItemKind;
  time: string | null;
  note: string;
};
export type WeekDay = { iso: string; isToday: boolean; isPast: boolean; items: WeekItem[] };

export type WeekRow = {
  profileId: string;
  name: string;
  avatarUrl?: string | null;
  nextOneOnOneOn: string | null;
  nextStartsAt: string | null;
  proposedOn: string | null;
  proposedBy: string | null;
  heldThisWeek: { day: string; format: string | null }[];
};

// The Monday of the week holding `iso` (weeks run Monday to Sunday).
export function mondayOf(iso: string): string {
  const dow = new Date(dateMs(iso)).getUTCDay(); // 0 = Sunday
  return addDays(iso, dow === 0 ? -6 : 1 - dow);
}

const KIND_ORDER: Record<WeekItemKind, number> = { held: 0, booked: 1, proposed: 2 };

export function buildWeekStrip(rows: WeekRow[], todayIso: string): WeekDay[] {
  const monday = mondayOf(todayIso);
  return [0, 1, 2, 3, 4].map((offset) => {
    const iso = addDays(monday, offset);
    const items: WeekItem[] = [];
    for (const r of rows) {
      for (const h of r.heldThisWeek) {
        if (h.day !== iso) continue;
        const how = formatLabel(h.format);
        items.push({ profileId: r.profileId, name: r.name, avatarUrl: r.avatarUrl ?? null, kind: "held", time: null, note: how ? `Done · ${how}` : "Done" });
      }
      if (r.nextOneOnOneOn === iso) {
        items.push({ profileId: r.profileId, name: r.name, avatarUrl: r.avatarUrl ?? null, kind: "booked", time: r.nextStartsAt, note: "Booked" });
      }
      if (r.proposedOn === iso && r.proposedBy === "member") {
        items.push({ profileId: r.profileId, name: r.name, avatarUrl: r.avatarUrl ?? null, kind: "proposed", time: null, note: "They proposed it" });
      }
    }
    items.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (a.time ?? "99").localeCompare(b.time ?? "99"));
    return { iso, isToday: iso === todayIso, isPast: iso < todayIso, items };
  });
}

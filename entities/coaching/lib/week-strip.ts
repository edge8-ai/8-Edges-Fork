import { addDays, dateMs } from "@/kernel/config/dates";
import { formatLabel } from "./session-done";
import type { RecapState } from "./recap-state";

// The roster's week at a glance (K.80): Monday to Friday of this week, and on
// each day the sessions on it — held, booked, planned by the pair's rhythm, or
// proposed by the employee and waiting on the coach. A coach opening the page on Monday sees the shape of
// their week before reading a row. Days only, people by name, nothing counted
// against anybody.

// "planned" is the rhythm's day when nothing is booked. Coaches book their
// fortnightly 1-1s in Lark, not here, so a strip of bookings alone showed one
// session on a day the CEO had three (2026-11-04).
export type WeekItemKind = "held" | "booked" | "planned" | "proposed";
export type WeekItem = {
  profileId: string;
  name: string;
  avatarUrl: string | null;
  kind: WeekItemKind;
  time: string | null;
  note: string;
  // Held sessions only: false while the shared recap is still to be written,
  // so the coach sees at a glance which of the week's 1-1s owe one.
  recapped?: boolean;
};
export type WeekDay = { iso: string; isToday: boolean; isPast: boolean; items: WeekItem[] };

export type WeekRow = {
  profileId: string;
  name: string;
  avatarUrl?: string | null;
  nextOneOnOneOn: string | null;
  nextStartsAt: string | null;
  // The day that keeps the rhythm when nothing is booked (CoachRosterRow
  // suggestedOn), and the member's usual time for it.
  plannedOn?: string | null;
  plannedStartsAt?: string | null;
  proposedOn: string | null;
  proposedBy: string | null;
  heldThisWeek: { day: string; format: string | null; recap: RecapState["kind"] }[];
};

// The Monday of the week holding `iso` (weeks run Monday to Sunday).
export function mondayOf(iso: string): string {
  const dow = new Date(dateMs(iso)).getUTCDay(); // 0 = Sunday
  return addDays(iso, dow === 0 ? -6 : 1 - dow);
}

const KIND_ORDER: Record<WeekItemKind, number> = { held: 0, booked: 1, planned: 2, proposed: 3 };

// A recap the routine is about to publish counts as written: nothing is left
// for the coach to do about it.
const RECAP_NOTE: Record<RecapState["kind"], string> = {
  published: "recap sent",
  waiting: "recap written",
  draft: "recap to write",
  none: "recap to write",
};

export function buildWeekStrip(rows: WeekRow[], todayIso: string): WeekDay[] {
  const monday = mondayOf(todayIso);
  return [0, 1, 2, 3, 4].map((offset) => {
    const iso = addDays(monday, offset);
    const items: WeekItem[] = [];
    for (const r of rows) {
      for (const h of r.heldThisWeek) {
        if (h.day !== iso) continue;
        const how = formatLabel(h.format);
        items.push({
          profileId: r.profileId,
          name: r.name,
          avatarUrl: r.avatarUrl ?? null,
          kind: "held",
          time: null,
          note: ["Done", how, RECAP_NOTE[h.recap]].filter(Boolean).join(" · "),
          recapped: h.recap === "published" || h.recap === "waiting",
        });
      }
      if (r.nextOneOnOneOn === iso) {
        items.push({ profileId: r.profileId, name: r.name, avatarUrl: r.avatarUrl ?? null, kind: "booked", time: r.nextStartsAt, note: "Booked" });
      }
      if (r.plannedOn === iso && r.nextOneOnOneOn !== iso) {
        items.push({ profileId: r.profileId, name: r.name, avatarUrl: r.avatarUrl ?? null, kind: "planned", time: r.plannedStartsAt ?? null, note: "Planned" });
      }
      if (r.proposedOn === iso && r.proposedBy === "member") {
        items.push({ profileId: r.profileId, name: r.name, avatarUrl: r.avatarUrl ?? null, kind: "proposed", time: null, note: "They proposed it" });
      }
    }
    items.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (a.time ?? "99").localeCompare(b.time ?? "99"));
    return { iso, isToday: iso === todayIso, isPast: iso < todayIso, items };
  });
}

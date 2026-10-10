import { selectBrands } from "@/entities/contacts";
import { listBroadcasts, type BroadcastRow } from "./broadcasts";
import { listSeries } from "./series";
import { dayAndTime, projectSeriesSends, type ScheduleItem, type SeriesMoments } from "./email-schedule-shared";

// The reads behind the Schedule page: every broadcast with a moment on the
// calendar, plus each active series' sends projected forward. A draft with no
// scheduled moment has no day yet, so it is returned apart for the list under
// the calendar instead of being guessed onto one.

export type EmailSchedule = {
  items: ScheduleItem[];
  unscheduled: { id: string; name: string; brandName: string | null; createdAt: string }[];
  error?: string;
};

// The moment a broadcast belongs to on the calendar. Sent rows keep the time
// they went; an approved row with no schedule sends on the next cron tick, so
// its approval time is the closest honest answer.
function broadcastMoment(b: BroadcastRow): string | null {
  if (b.status === "sent" || b.status === "sending") return b.sentAt ?? b.scheduledAt ?? b.approvedAt;
  return b.scheduledAt ?? (b.status === "approved" ? b.approvedAt : null);
}

function broadcastItem(b: BroadcastRow, at: string): ScheduleItem {
  const { day, time } = dayAndTime(new Date(at));
  return {
    key: `broadcast:${b.id}`,
    kind: "broadcast",
    status: b.status,
    title: b.name,
    brandName: b.brandName,
    at,
    day,
    time,
    href: `/admin/revenue/marketing/broadcasts/${b.id}`,
  };
}

export async function getEmailSchedule(now: Date = new Date(), weeks = 8): Promise<EmailSchedule> {
  const [broadcasts, series, brands] = await Promise.all([listBroadcasts(), listSeries(), selectBrands("id, name")]);
  if (broadcasts.error) return { items: [], unscheduled: [], error: broadcasts.error };
  if (series.error) return { items: [], unscheduled: [], error: series.error };
  if (brands.error) return { items: [], unscheduled: [], error: brands.error.message };
  const brandName = new Map(((brands.data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));

  const items: ScheduleItem[] = [];
  const unscheduled: EmailSchedule["unscheduled"] = [];
  // Every issue's scheduled moment by series, so a projected send that already
  // has its issue is not drawn twice.
  const issueSendAts = new Map<string, Set<string>>();
  for (const b of broadcasts.rows) {
    if (b.seriesId && b.scheduledAt) {
      const set = issueSendAts.get(b.seriesId) ?? new Set<string>();
      set.add(new Date(b.scheduledAt).toISOString());
      issueSendAts.set(b.seriesId, set);
    }
    const at = broadcastMoment(b);
    if (at) items.push(broadcastItem(b, at));
    else if (b.status === "draft") unscheduled.push({ id: b.id, name: b.name, brandName: b.brandName, createdAt: b.createdAt });
  }

  for (const s of series.rows) {
    if (!s.active) continue;
    const moments: SeriesMoments = {
      id: s.id,
      name: s.name,
      brandName: s.brandId ? (brandName.get(s.brandId) ?? null) : null,
      timeZone: s.timeZone,
      draftWeekday: s.draftWeekday,
      draftHour: s.draftHour,
      sendWeekday: s.sendWeekday,
      sendHour: s.sendHour,
    };
    items.push(...projectSeriesSends(moments, issueSendAts.get(s.id) ?? new Set(), now, weeks));
  }

  items.sort((a, b) => a.at.localeCompare(b.at));
  return { items, unscheduled };
}

// The email schedule: every send that is planned or has happened, as one list
// of dated items the calendar can draw. Broadcasts are actual rows; series
// sends are projected from the series' weekly moments and never stored, so the
// calendar always agrees with the series editor. Pure functions here; the
// reads live in email-schedule.ts.
import { nextSendInstant } from "./send-window";

// Where a day boundary falls for the calendar. Company time, so "Wednesday's
// sends" means the same thing to everyone reading the page.
export const SCHEDULE_ZONE = "Asia/Ho_Chi_Minh";

export type ScheduleKind = "broadcast" | "series";

// A broadcast carries its own status; a projected series send is either still
// ahead of its draft moment (projected) or past it with no issue opened
// (unwritten), which is the gap to see before the send day.
export type ScheduleStatus = "draft" | "approved" | "sending" | "sent" | "cancelled" | "missed" | "projected" | "unwritten";

export type ScheduleItem = {
  key: string;
  kind: ScheduleKind;
  status: ScheduleStatus;
  title: string;
  brandName: string | null;
  // The send instant, ISO. Sent broadcasts carry their sent time.
  at: string;
  // YYYY-MM-DD and HH:mm in SCHEDULE_ZONE, for placement and the chip label.
  day: string;
  time: string;
  href: string;
};

export const STATUS_LABEL: Record<ScheduleStatus, string> = {
  draft: "Draft",
  approved: "Approved",
  sending: "Sending",
  sent: "Sent",
  cancelled: "Cancelled",
  missed: "Missed",
  projected: "Projected",
  unwritten: "Unwritten",
};

const pad2 = (n: number) => String(n).padStart(2, "0");

export function dayAndTime(at: Date, zone: string = SCHEDULE_ZONE): { day: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, time: `${pad2(Number(get("hour")))}:${get("minute")}` };
}

export type SeriesMoments = {
  id: string;
  name: string;
  brandName: string | null;
  timeZone: string;
  draftWeekday: number;
  draftHour: number;
  sendWeekday: number;
  sendHour: number;
};

const WEEK_MS = 7 * 86_400_000;

// The series' send moments from `now` for `weeks` weeks, minus the ones an
// issue already exists for (those show as the issue's own broadcast chip).
// `issueSendAts` holds the ISO scheduled_at of every issue the series has
// opened, which is the same key the series cron dedupes on.
export function projectSeriesSends(
  series: SeriesMoments,
  issueSendAts: Set<string>,
  now: Date,
  weeks = 8,
): ScheduleItem[] {
  const items: ScheduleItem[] = [];
  let from = now;
  for (let i = 0; i < weeks; i++) {
    const sendAt = nextSendInstant({ weekday: series.sendWeekday, hour: series.sendHour }, series.timeZone, from);
    from = sendAt;
    if (issueSendAts.has(sendAt.toISOString())) continue;
    // The draft moment that belongs to this send: the last one before it.
    const draftAt = nextSendInstant({ weekday: series.draftWeekday, hour: series.draftHour }, series.timeZone, new Date(sendAt.getTime() - WEEK_MS));
    const status: ScheduleStatus = draftAt.getTime() <= now.getTime() ? "unwritten" : "projected";
    const { day, time } = dayAndTime(sendAt);
    items.push({
      key: `series:${series.id}:${sendAt.toISOString()}`,
      kind: "series",
      status,
      title: series.name,
      brandName: series.brandName,
      at: sendAt.toISOString(),
      day,
      time,
      href: `/admin/revenue/marketing/recurring/${series.id}`,
    });
  }
  return items;
}

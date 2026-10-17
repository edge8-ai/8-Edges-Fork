// When a broadcast lands in each contact's morning. A send window is one or
// more weekdays and an hour in the contact's own time zone; each recipient is
// stamped with the next such moment when the broadcast is approved, and the
// cron releases rows as their moment arrives. Zones come from what the CRM
// knows about the contact, in order of trust: a recorded zone, the city, the
// country, the brand's own zone. The source is returned with the zone so a send
// report can say how many people fell to the default.

// Weekdays run 0 Sunday .. 6 Saturday. Windows saved before a broadcast could
// go out on two days carry a single `weekday`, and still read.
export type SendWindow = { weekdays?: number[]; weekday?: number; hour: number };

export const TUESDAY_FRIDAY_EIGHT: SendWindow = { weekdays: [2, 5], hour: 8 };

function daysOf(window: SendWindow): number[] {
  return window.weekdays ?? (window.weekday === undefined ? [] : [window.weekday]);
}
export const DEFAULT_ZONE = "Asia/Ho_Chi_Minh";

export type ZoneSource = "timezone" | "city" | "country" | "default";

const CITY_ZONES: Record<string, string> = {
  "ho chi minh city": "Asia/Ho_Chi_Minh",
  saigon: "Asia/Ho_Chi_Minh",
  hanoi: "Asia/Ho_Chi_Minh",
  "da nang": "Asia/Ho_Chi_Minh",
  perth: "Australia/Perth",
  "o'connor": "Australia/Perth",
  sydney: "Australia/Sydney",
  melbourne: "Australia/Melbourne",
  brisbane: "Australia/Brisbane",
  adelaide: "Australia/Adelaide",
  dallas: "America/Chicago",
  houston: "America/Chicago",
  austin: "America/Chicago",
  chicago: "America/Chicago",
  denver: "America/Denver",
  "los angeles": "America/Los_Angeles",
  "san francisco": "America/Los_Angeles",
  seattle: "America/Los_Angeles",
  "new york": "America/New_York",
  boston: "America/New_York",
  miami: "America/New_York",
  london: "Europe/London",
  singapore: "Asia/Singapore",
  "kuala lumpur": "Asia/Kuala_Lumpur",
  "hong kong": "Asia/Hong_Kong",
  manila: "Asia/Manila",
  auckland: "Pacific/Auckland",
  bangkok: "Asia/Bangkok",
  dubai: "Asia/Dubai",
};

// Countries with one zone that matters for a morning send. The United States
// is deliberately the east coast: it is the most populous zone and the error
// for a west-coast contact is three hours, not a whole day.
const COUNTRY_ZONES: Record<string, string> = {
  vietnam: "Asia/Ho_Chi_Minh",
  australia: "Australia/Sydney",
  "united states": "America/New_York",
  usa: "America/New_York",
  us: "America/New_York",
  malaysia: "Asia/Kuala_Lumpur",
  "hong kong": "Asia/Hong_Kong",
  singapore: "Asia/Singapore",
  "new zealand": "Pacific/Auckland",
  philippines: "Asia/Manila",
  thailand: "Asia/Bangkok",
  "united kingdom": "Europe/London",
  uk: "Europe/London",
  "united arab emirates": "Asia/Dubai",
  canada: "America/Toronto",
  india: "Asia/Kolkata",
  japan: "Asia/Tokyo",
  indonesia: "Asia/Jakarta",
};

// Recorded zones are free text today ("UTC+07:00 (Thailand, Vietnam)"); an
// IANA name is taken as is, a UTC offset maps to the zone that offset means on
// this list, anything else is ignored.
const OFFSET_ZONES: Record<string, string> = {
  "+07:00": "Asia/Ho_Chi_Minh",
  "+08:00": "Asia/Singapore",
  "+09:00": "Asia/Tokyo",
  "+10:00": "Australia/Sydney",
  "+11:00": "Australia/Sydney",
  "+12:00": "Pacific/Auckland",
  "+13:00": "Pacific/Auckland",
  "+00:00": "Europe/London",
  "+01:00": "Europe/London",
  "-04:00": "America/New_York",
  "-05:00": "America/New_York",
  "-06:00": "America/Chicago",
  "-07:00": "America/Denver",
  "-08:00": "America/Los_Angeles",
};

function isIanaZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value.includes("/");
  } catch {
    return false;
  }
}

export function zoneFor(contact: { timezone?: string | null; city?: string | null; country?: string | null }): { zone: string; source: ZoneSource } {
  const tz = contact.timezone?.trim();
  if (tz) {
    if (isIanaZone(tz)) return { zone: tz, source: "timezone" };
    const offset = tz.match(/UTC\s*([+-]\d{2}:\d{2})/i)?.[1];
    if (offset && OFFSET_ZONES[offset]) return { zone: OFFSET_ZONES[offset], source: "timezone" };
  }
  const city = contact.city?.trim().toLowerCase();
  if (city && CITY_ZONES[city]) return { zone: CITY_ZONES[city], source: "city" };
  const country = contact.country?.trim().toLowerCase();
  if (country && COUNTRY_ZONES[country]) return { zone: COUNTRY_ZONES[country], source: "country" };
  return { zone: DEFAULT_ZONE, source: "default" };
}

// The zone's offset from UTC, in minutes, at a given instant (DST included).
function offsetMinutes(at: Date, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

// The instant when the zone's wall clock next reads `window` strictly after
// `from`. Walks day by day from `from` in that zone, so a window later today
// still counts as today and DST is handled by re-reading the offset at the
// candidate instant.
export function nextSendInstant(window: SendWindow, zone: string, from: Date = new Date()): Date {
  const days = daysOf(window);
  const local = new Date(from.getTime() + offsetMinutes(from, zone) * 60_000);
  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const wall = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + dayOffset, window.hour, 0, 0));
    if (!days.includes(wall.getUTCDay())) continue;
    // First guess with the offset now, then correct with the offset at the guess.
    let instant = new Date(wall.getTime() - offsetMinutes(from, zone) * 60_000);
    instant = new Date(wall.getTime() - offsetMinutes(instant, zone) * 60_000);
    if (instant.getTime() > from.getTime()) return instant;
  }
  // Reached only by a window with no weekdays: eight days contain every weekday.
  return from;
}

export function describeWindow(window: SendWindow): string {
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const days = daysOf(window).map((d) => names[d] ?? "the day");
  const joined = days.length > 1 ? `${days.slice(0, -1).join(", ")} and ${days[days.length - 1]}` : (days[0] ?? "the day");
  return `${joined} at ${String(window.hour).padStart(2, "0")}:00 in each contact's time zone`;
}

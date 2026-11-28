import { formatCents } from "@/kernel/ui/format";

// Shared event types + pure display helpers. Safe to import from client and
// server components alike (no Supabase, no node builtins). Server-side
// queries and ticket-code generation live in lib/events-server.ts.
// Design: docs/plans/2026-07-11-event-management-design.md

export const EVENT_TYPES = [
  "retreat",
  "workshop",
  "keynote",
  "webinar",
  "micro_session",
  "dinner",
  "private_trip",
  "company_event",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_STATUSES = [
  "draft",
  "published",
  "open",
  "closed",
  "completed",
  "cancelled",
] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_VISIBILITIES = ["public", "private", "internal"] as const;
export type EventVisibility = (typeof EVENT_VISIBILITIES)[number];

// Registration lifecycle. Legacy rows predate the events model: 'confirmed'
// reads as registered (see normalizeRegistrationStatus) and is never
// rewritten; 'refunded' exists in live data and stays terminal.
export const REGISTRATION_STATUSES = [
  "pending_payment",
  "registered",
  "waitlisted",
  "cancelled",
  "attended",
  "no_show",
  "confirmed",
  "refunded",
] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

// Statuses that hold a seat against event/tier capacity (mirrors the
// register_for_event RPC — keep the two in sync).
export const SEAT_HOLDING_STATUSES: RegistrationStatus[] = [
  "pending_payment",
  "registered",
  "attended",
  "confirmed",
];

export function normalizeRegistrationStatus(status: string): RegistrationStatus {
  return status === "confirmed" ? "registered" : (status as RegistrationStatus);
}

// Ordered gallery item (events.media jsonb). Images are event-media bucket
// uploads; videos are external URLs (YouTube/Vimeo/direct file).
export type EventMedia = {
  kind: "image" | "video";
  url: string;
  caption?: string | null;
};

export type EventRecord = {
  id: string;
  slug: string;
  type: EventType;
  status: EventStatus;
  visibility: EventVisibility;
  title: string;
  blurb: string | null;
  description: string | null;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string;
  capacity: number | null;
  cover_image_url: string | null;
  media: EventMedia[];
  owner_person_id: string | null;
  landing_path: string | null;
  feedback_survey_id: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

// An event tier is a company_os.products row (type='event') linked via
// event_id. capacity here is the per-tier cap, independent of the event's.
export type EventTier = {
  id: string;
  event_id: string | null;
  title: string;
  tier: string | null;
  description: string | null;
  amount_cents: number;
  amount_usd_cents: number | null;
  currency: string;
  capacity: number | null;
  sort_order: number;
  active: boolean;
};

// --- Pricing display -------------------------------------------------------

// A tier at 0 cents is Free (skips Stripe); an event with no active tiers is
// entirely free.
export function tierPriceLabel(tier: Pick<EventTier, "amount_cents" | "currency">): string {
  return tier.amount_cents === 0 ? "Free" : formatCents(tier.amount_cents, tier.currency);
}

// List/card summary: "Free" or "From $X" (cheapest active tier).
export function eventPriceSummary(
  tiers: Array<Pick<EventTier, "amount_cents" | "currency" | "active">>
): string {
  const active = tiers.filter((t) => t.active);
  if (active.length === 0) return "Free";
  const cheapest = active.reduce((a, b) => (b.amount_cents < a.amount_cents ? b : a));
  if (cheapest.amount_cents === 0) return "Free";
  return `From ${formatCents(cheapest.amount_cents, cheapest.currency)}`;
}

// --- Date display -----------------------------------------------------------

// "Aug 24, 2026" / "Aug 24–26, 2026" / "Aug 30 – Sep 2, 2026", rendered in
// the event's own timezone so a 9am Saigon start doesn't show as the prior
// day for a UTC server.
export function formatEventDates(
  startsAt: string | null,
  endsAt: string | null,
  timezone: string
): string {
  if (!startsAt) return "Dates TBD";
  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { timeZone: timezone, ...opts }).format(new Date(iso));
  const startDay = fmt(startsAt, { month: "short", day: "numeric", year: "numeric" });
  if (!endsAt) return startDay;
  const endDay = fmt(endsAt, { month: "short", day: "numeric", year: "numeric" });
  if (endDay === startDay) return startDay;
  const sameMonth =
    fmt(startsAt, { month: "short", year: "numeric" }) === fmt(endsAt, { month: "short", year: "numeric" });
  if (sameMonth) {
    return `${fmt(startsAt, { month: "short", day: "numeric" })}–${fmt(endsAt, { day: "numeric" })}, ${fmt(endsAt, { year: "numeric" })}`;
  }
  return `${fmt(startsAt, { month: "short", day: "numeric" })} – ${endDay}`;
}

// --- Slugs ------------------------------------------------------------------

// --- Video embeds -----------------------------------------------------------

export type VideoEmbed =
  | { type: "youtube" | "vimeo"; embedSrc: string }
  | { type: "file"; url: string }
  | { type: "link"; url: string };

// Classify a pasted video URL for the public page: YouTube/Vimeo become
// privacy-friendly iframe embeds, direct files a <video> tag, anything else
// an outbound link. Pure — safe for client and server.
export function parseVideoEmbed(url: string): VideoEmbed {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { type: "link", url };
  }
  const host = u.hostname.replace(/^www\./, "");

  if (host === "youtu.be" || host === "youtube.com" || host === "youtube-nocookie.com" || host === "m.youtube.com") {
    let id = "";
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
    else if (u.pathname === "/watch") id = u.searchParams.get("v") ?? "";
    else if (u.pathname.startsWith("/shorts/") || u.pathname.startsWith("/embed/") || u.pathname.startsWith("/live/"))
      id = u.pathname.split("/")[2] ?? "";
    if (/^[\w-]{6,20}$/.test(id)) {
      return { type: "youtube", embedSrc: `https://www.youtube-nocookie.com/embed/${id}` };
    }
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = u.pathname.split("/").find((p) => /^\d{6,}$/.test(p));
    if (id) return { type: "vimeo", embedSrc: `https://player.vimeo.com/video/${id}` };
  }

  if (/\.(mp4|webm|mov|m4v)$/i.test(u.pathname)) return { type: "file", url };
  return { type: "link", url };
}

// --- Ticket URLs (pure string helpers; code generation is server-only) -----

export function ticketPath(code: string): string {
  return `/t/${code}`;
}

export function eventPath(slug: string): string {
  return `/events/${slug}`;
}

// Accept a scanned value that may be a full ticket URL ("https://host/t/ABC?x=1")
// or a bare code, and return the bare code. Returns "" if nothing usable.
export function normalizeTicketCode(scanned: string): string {
  const raw = scanned.trim();
  if (!raw) return "";
  const marker = "/t/";
  const idx = raw.indexOf(marker);
  const tail = idx === -1 ? raw : raw.slice(idx + marker.length);
  return tail.split(/[/?#]/)[0].trim().toUpperCase();
}

// The browser-safe half of the marketing calendar: the channel and status
// vocabulary, the accents the kanban and the month grid tint by, and the row
// shapes. lib/marketing-calendar.ts holds the reads and imports the service-role
// client, so the calendar and campaign client components that took these
// constants from there pulled the whole data layer (and the broadcast reader
// behind it) into the browser bundle. They import from here instead, and the
// server module re-exports everything so its own callers are unchanged.
import {
  STAGE_LEAD,
  STAGE_NEUTRAL,
  STAGE_PROPOSAL,
  STAGE_CONTRACT,
  STAGE_WON,
  STAGE_LOST,
} from "@/kernel/ui/stageColors";

export type CalendarChannel = "blog" | "email" | "linkedin" | "facebook" | "twitter";
export type CalendarStatus =
  | "idea"
  | "drafted"
  | "approved"
  | "scheduled"
  | "published"
  | "skipped";

// Board columns, in flow order. Accents mirror the pipeline palette
// (stageColors) since the kanban consumes them as inline-style strings.
export const STATUSES: { id: CalendarStatus; label: string; accent: string }[] = [
  { id: "idea", label: "Idea", accent: STAGE_NEUTRAL },
  { id: "drafted", label: "Drafted", accent: STAGE_LEAD },
  { id: "approved", label: "Approved", accent: STAGE_PROPOSAL },
  { id: "scheduled", label: "Scheduled", accent: STAGE_CONTRACT },
  { id: "published", label: "Published", accent: STAGE_WON },
  // Labelled Not Doing (2026-09-24) to match the Workboard's stage of that
  // name; the stored value stays "skipped", so the writer agent, the recaps
  // and every count that excludes abandoned assets read it unchanged.
  { id: "skipped", label: "Not Doing", accent: STAGE_LOST },
];

// Channel accents are the platform's own identity color, used only as a chip
// tint so a month grid is scannable by channel. Raw hex mirrors stageColors.
export const CHANNELS: { id: CalendarChannel; label: string; accent: string }[] = [
  { id: "blog", label: "Blog", accent: "var(--admin-muted)" },
  { id: "email", label: "Email", accent: "var(--admin-accent)" },
  { id: "linkedin", label: "LinkedIn", accent: "var(--admin-chart-3)" },
  { id: "facebook", label: "Facebook", accent: "var(--admin-chart-6)" },
  { id: "twitter", label: "Twitter", accent: "var(--admin-chart-4)" },
];

export const STATUS_LABEL: Record<CalendarStatus, string> = Object.fromEntries(
  STATUSES.map((s) => [s.id, s.label]),
) as Record<CalendarStatus, string>;
export const CHANNEL_LABEL: Record<CalendarChannel, string> = Object.fromEntries(
  CHANNELS.map((c) => [c.id, c.label]),
) as Record<CalendarChannel, string>;
export const CHANNEL_ACCENT: Record<CalendarChannel, string> = Object.fromEntries(
  CHANNELS.map((c) => [c.id, c.accent]),
) as Record<CalendarChannel, string>;

export type BrandOption = { id: string; name: string; slug: string };
export type PillarOption = { id: string; brandId: string; name: string };

export type CalendarEntryRow = {
  id: string;
  title: string;
  brandId: string | null;
  brandName: string | null;
  pillarId: string | null;
  pillarName: string | null;
  channel: CalendarChannel;
  status: CalendarStatus;
  publishDate: string | null; // YYYY-MM-DD
  parentId: string | null;
  // The email-send link (email_campaigns). Named "broadcast" since PR 2.
  broadcastId: string | null;
  broadcastStatus: string | null;
  // The umbrella campaign (marketing_campaigns) this asset belongs to.
  campaignId: string | null;
  campaignName: string | null;
  copyMd: string | null;
  assetUrl: string | null;
  postedUrl: string | null;
  notes: string | null;
  blogStyle: string | null;
  socialStyle: string | null;
  imageStyle: string | null;
  imageType: string | null;
  seoMd: string | null;
  imageBriefMd: string | null;
  imageUrl: string | null;
  bodyHtml: string | null;
  sortOrder: number;
  createdAt: string;
};

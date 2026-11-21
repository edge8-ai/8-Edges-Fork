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

// The six stored statuses, in flow order, and the labels STATUS_LABEL takes
// from them. The board groups them into fewer columns (BOARD_COLUMNS below). Accents
// mirror the pipeline palette (stageColors) since the UI consumes them as
// inline-style strings.
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
  // The platform is X now; the stored value stays "twitter".
  { id: "twitter", label: "X", accent: "var(--admin-chart-4)" },
];

export const STATUS_LABEL: Record<CalendarStatus, string> = Object.fromEntries(
  STATUSES.map((s) => [s.id, s.label]),
) as Record<CalendarStatus, string>;
export const CHANNEL_LABEL: Record<CalendarChannel, string> = Object.fromEntries(
  CHANNELS.map((c) => [c.id, c.label]),
) as Record<CalendarChannel, string>;
/** The name the marketer reads for a channel held as a plain string; an unknown one reads as stored. */
export function channelLabel(channel: string): string {
  return (CHANNEL_LABEL as Record<string, string>)[channel] ?? channel;
}
export const CHANNEL_ACCENT: Record<CalendarChannel, string> = Object.fromEntries(
  CHANNELS.map((c) => [c.id, c.accent]),
) as Record<CalendarChannel, string>;

// The calendar board's columns (R3.345). The marketer treats idea, drafted and
// approved alike as "not out yet", so one Draft column holds all three and a
// badge on each card keeps them apart. The stored statuses stay six: the
// writer, the blog cron and the Revenue board sync all read them unchanged.
// Not Doing is listed last and the board shows it only behind a switch.
export type BoardColumnId = "draft" | "scheduled" | "published" | "not-doing";

export const BOARD_COLUMNS: { id: BoardColumnId; label: string; accent: string }[] = [
  { id: "draft", label: "Draft", accent: STAGE_LEAD },
  { id: "scheduled", label: "Scheduled", accent: STAGE_CONTRACT },
  { id: "published", label: "Published", accent: STAGE_WON },
  { id: "not-doing", label: "Not Doing", accent: STAGE_LOST },
];

/** The board column a post with this status shows in. */
export function boardColumnFor(status: CalendarStatus): BoardColumnId {
  switch (status) {
    case "idea":
    case "drafted":
    case "approved":
      return "draft";
    case "skipped":
      return "not-doing";
    default:
      return status;
  }
}

/**
 * The status a post takes when dropped in a board column. A post moved within
 * Draft keeps its status, since the column does not say which of the three it
 * is. A post brought back into Draft from Scheduled or Published becomes
 * approved, the same as unticking it on the Revenue board. A post revived from
 * Not Doing becomes drafted: nobody approved it since it was dropped, so it
 * needs a person again (and a social one does not yet show "Post by hand").
 * Every other column takes its own status.
 */
export function statusOnDrop(status: CalendarStatus, column: BoardColumnId): CalendarStatus {
  if (column === "draft") {
    if (boardColumnFor(status) === "draft") return status;
    return status === "skipped" ? "drafted" : "approved";
  }
  if (column === "not-doing") return "skipped";
  return column;
}

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

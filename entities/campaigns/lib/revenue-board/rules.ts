import { CHANNEL_LABEL, type CalendarChannel, type CalendarStatus } from "@/entities/campaigns/lib/marketing-calendar-shared";

// The content calendar as Revenue board cards (Dave, 2026-09-24): one card per
// day of posts, assigned to the board's owner, with a subtask per post; and a
// card per campaign the writer agent runs, so the agent's work is on the board
// beside the people's. This file is the rules, pure, so the tests can pin them;
// sync-days.ts and sync-agents.ts read and write.

/** A card's `subject_type` for a day of content; its date is in metadata.content_day. */
export const SUBJECT_CONTENT_DAY = "marketing_day";
/** A subtask's `subject_type`: the subtask is this content asset. */
export const SUBJECT_CONTENT_ASSET = "marketing_content";
/** A card's `subject_type` for one campaign the writer agent runs. */
export const SUBJECT_CAMPAIGN = "marketing_campaign";

// One post is one small, fixed act: open the copy, post it, tick it. The day
// card's size is the sum of its posts (a card with sized subtasks is their sum).
export const POST_TOKENS = 0.05;

export type SyncAsset = {
  id: string;
  title: string;
  channel: CalendarChannel;
  status: CalendarStatus;
  publish_date: string;
  /** The name of the campaign the post belongs to, or null for a post outside any campaign. */
  campaign: string | null;
  /** That campaign's start date: a post on it is the campaign's launch. */
  campaign_starts_on: string | null;
};

// A campaign posts on its launch day and the days after, so a busy day can
// hold posts from eight campaigns; the title names this many and counts the rest.
const DAY_TITLE_NAMES = 2;

/**
 * A day card's title: the day, then the campaigns with a post on it, each once,
 * the ones launching that day first and then in the order their posts run, two
 * at most and "+ N more" for the rest. Before this the title was the day alone,
 * so a campaign's posts could not be found on the board by the campaign's name.
 */
export function dayCardTitle(dayLabel: string, assets: Pick<SyncAsset, "campaign" | "campaign_starts_on" | "publish_date">[]): string {
  const named = assets.filter((a): a is typeof a & { campaign: string } => Boolean(a.campaign));
  const launches = named.filter((a) => a.campaign_starts_on === a.publish_date);
  const names = [...new Set([...launches, ...named].map((a) => a.campaign))];
  if (names.length === 0) return `Content · ${dayLabel}`;
  const rest = names.length - DAY_TITLE_NAMES;
  return `Content · ${dayLabel} · ${names.slice(0, DAY_TITLE_NAMES).join(" + ")}${rest > 0 ? ` + ${rest} more` : ""}`;
}

/**
 * The value to write to a field the sync shares with people (a card's title,
 * its deadline), or undefined to leave it. The sync owns the field only while
 * it still reads exactly as the sync last wrote it, recorded in the card's
 * metadata (`recorded`, undefined when nothing was recorded, null a value it
 * cleared); a card made before the sync recorded it is judged against
 * `legacy`, what the sync wrote then. A value a person changed has become
 * theirs and stays, as with the campaign card's description.
 */
export function followIfOurs<T extends string | null>(current: T, recorded: unknown, legacy: T, want: T): T | undefined {
  const ours = recorded === undefined ? legacy : recorded;
  return current === ours && current !== want ? want : undefined;
}

/** A post that still needs a person before it can go out: not yet approved. */
export const needsHuman = (a: Pick<SyncAsset, "status">): boolean => a.status === "idea" || a.status === "drafted";

/** What the post's subtask should say and be. Not Doing posts leave the card. */
export function subtaskFor(a: SyncAsset): { title: string; status: "open" | "done"; archived: boolean } {
  const title = `${CHANNEL_LABEL[a.channel] ?? a.channel}: ${a.title}${needsHuman(a) ? " (needs a human)" : ""}`;
  return { title, status: a.status === "published" ? "done" : "open", archived: a.status === "skipped" };
}

/**
 * Where a day stands, from its posts: every post out (or dropped, with at least
 * one out) is done; every post dropped is Not Doing; anything else is open.
 */
export function contentDayState(assets: Pick<SyncAsset, "status">[]): "open" | "done" | "not_doing" {
  if (assets.length === 0) return "open";
  const live = assets.filter((a) => a.status !== "skipped");
  if (live.length === 0) return "not_doing";
  return live.every((a) => a.status === "published") ? "done" : "open";
}

export type SyncCampaign = {
  id: string;
  name: string;
  status: string;
  starts_on: string | null;
  writer_step: string | null;
  writer_error: string | null;
};

export type AgentState = "queued" | "working" | "stuck" | "done" | "not_doing";

/**
 * Where a campaign stands, as a column on the board. The card is the campaign,
 * due on its publish date, so it is Done once every post is out (Khoa,
 * 2026-10-30), not when the writer finishes drafting, which can be weeks
 * before. Until then it says where the work is: To Do before the writer
 * starts, Doing while it drafts or the posts go out, Waiting while the writer
 * is stuck on a person.
 */
export function campaignCardState(c: SyncCampaign, posts: Pick<SyncAsset, "status">[]): AgentState {
  if (c.status === "archived") return "not_doing";
  if (c.writer_error && c.status !== "done") return "stuck";
  if (posts.length > 0) {
    const day = contentDayState(posts);
    if (day !== "open") return day;
  } else if (c.status === "done") return "done";
  return c.writer_step || c.status === "done" || posts.some((p) => p.status === "published") ? "working" : "queued";
}

/** What a campaign card says about its campaign when it is made. */
export type CampaignFacts = { starts_on: string | null; brand: string | null; objective: string | null; idea: string | null };

// The idea is the brief the writer works from, often thousands of characters,
// so the card carries its opening and links to the rest.
const IDEA_CHARS = 280;

function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= IDEA_CHARS) return flat;
  const cut = flat.slice(0, IDEA_CHARS);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : IDEA_CHARS).trimEnd()} …`;
}

/** The details a campaign card opens with: when it publishes, for which brand and why, the idea's opening and the campaign's link. */
export function campaignDetails(c: CampaignFacts, link: string, dayLabel: (iso: string) => string): string {
  return [
    c.starts_on ? `Publishes ${dayLabel(c.starts_on)}` : "No publish date yet",
    c.brand ? `Brand: ${c.brand}` : null,
    c.objective?.trim() ? `Objective: ${c.objective.trim()}` : null,
    c.idea?.trim() ? `Idea: ${excerpt(c.idea)}` : null,
    `Campaign: ${link}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

/** The asset status a closed subtask means: ticked is out, Not Doing is dropped. */
export function assetStatusFor(subtaskStatus: string): "published" | "skipped" | null {
  if (subtaskStatus === "done") return "published";
  if (subtaskStatus === "not_doing") return "skipped";
  return null;
}

/**
 * True when an insert failed because the row already exists: Postgres's
 * unique violation. The content sync's cards are unique by subject (migration
 * 20260924120000), so this means an overlapping run filed the same card a
 * moment ago, which is the outcome the insert wanted, not a failure.
 */
export const alreadyMade = (error: { code?: string } | null | undefined): boolean => error?.code === "23505";

/** The sentence the sync puts on a stuck writer card, or null when the writer is not stuck. */
export const writerNote = (writerError: string | null | undefined): string | null =>
  writerError ? `The writer stopped: ${writerError}` : null;

/**
 * The note the sync last put on a writer card, read back from the error it
 * recorded in metadata.writer_error, so the sync can tell its own words from a
 * person's.
 */
export function previousWriterNote(metadata: Record<string, unknown> | null, description: string | null): string | null {
  const recorded = metadata?.writer_error;
  if (typeof recorded === "string") return writerNote(recorded);
  if (metadata && "writer_error" in metadata) return null;
  // A card filed before R.22 has no writer_error: its sync wrote the whole
  // description as the note, so a single paragraph in that form is the
  // sync's own, and anything else is a person's.
  return description?.startsWith("The writer stopped: ") && !description.includes("\n\n") ? description : null;
}

/**
 * A writer card's description after the writer's state changed. The sync owns
 * only its own note, the one sentence it last appended, and a person owns
 * everything else: the note it wrote before is taken off only while it is
 * still exactly as written, alone or after a blank line at the end, and the
 * new note (if the writer is stuck) goes after whatever the person wrote. A
 * note a person edited has become theirs and stays. So typing on a stuck card
 * is never erased by the writer recovering, and a card nobody typed on reads
 * exactly as it always did: the error while stuck, empty after.
 */
export function writerDescription(current: string | null, previousNote: string | null, note: string | null): string | null {
  let theirs = current ?? "";
  if (previousNote && theirs === previousNote) theirs = "";
  else if (previousNote && theirs.endsWith(`\n\n${previousNote}`)) theirs = theirs.slice(0, -previousNote.length - 2);
  const parts = [theirs, note].filter((p): p is string => Boolean(p && p.trim()));
  return parts.length ? parts.join("\n\n") : null;
}

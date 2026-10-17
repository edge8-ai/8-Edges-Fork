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
};

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

/** Where the writer is with a campaign, as a column on the board. */
export function agentState(c: SyncCampaign): AgentState {
  if (c.status === "archived") return "not_doing";
  if (c.status === "done") return "done";
  if (c.writer_error) return "stuck";
  return c.writer_step ? "working" : "queued";
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

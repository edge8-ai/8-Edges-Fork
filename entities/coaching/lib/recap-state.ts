import { RECAP_RUN_GRAIN_MINUTES, RECAP_WINDOW_HOURS } from "./history-shared";
import type { OneOnOneStatus } from "./types";

// Where one 1-1's shared recap stands, decided once (A.60). The coach's meeting
// row, the coach's summaries panel and the member's History all say something
// about the recap, and each used to decide it with its own condition: History
// promised an hour to a written recap on a 1-1 the routine never selects, and
// every promise named updated_at + 24h, which is up to 59 minutes before the
// routine actually runs.
//
// This is the read side of one rule whose write side is publishDueRecaps in
// data/recap-publish.ts. The routine publishes a row when
//
//   status = 'held' and archived_at is null and shared_published_at is null
//   and shared_summary_markdown is not blank after trim
//   and updated_at < (the run's now − RECAP_WINDOW_HOURS)
//
// and "waiting" below is exactly that predicate. The two must agree: change one
// and change the other, or the page promises an hour that never comes.
//
// Pure, so the client components may import it.

export type RecapState =
  | { kind: "none" }
  | { kind: "draft" }
  | { kind: "waiting"; publishesAt: string }
  | { kind: "published" };

export type RecapMeeting = {
  status: OneOnOneStatus;
  // Optional because the coach's profile read already drops archived 1-1s and
  // does not carry the column.
  archivedAt?: string | null;
  sharedSummaryMarkdown: string | null;
  sharedPublishedAt: string | null;
  updatedAt: string | null;
};

export function recapState(meeting: RecapMeeting): RecapState {
  if (meeting.sharedPublishedAt) return { kind: "published" };
  if (!meeting.sharedSummaryMarkdown?.trim()) return { kind: "none" };
  // Text the routine will not publish (a 1-1 not marked held, or archived) is
  // still the coach's draft: nothing will release it but the coach.
  if (meeting.status !== "held" || meeting.archivedAt || !meeting.updatedAt) return { kind: "draft" };
  return { kind: "waiting", publishesAt: recapPublishesAt(meeting.updatedAt) };
}

// The first routine run that will select a recap last touched at `updatedAt`.
// A run at H publishes rows with updated_at < H − window, so the run must fall
// strictly after updatedAt + window: the next grain boundary, and the one after
// when updatedAt + window lands exactly on a boundary (`.lt` is strict).
function recapPublishesAt(updatedAt: string): string {
  const grain = RECAP_RUN_GRAIN_MINUTES * 60_000;
  const due = new Date(updatedAt).getTime() + RECAP_WINDOW_HOURS * 3_600_000;
  return new Date(Math.floor(due / grain) * grain + grain).toISOString();
}

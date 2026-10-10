import { companyOs } from "@/kernel/data/supabase";
import { getTimelineExtras } from "./my-timeline";

import type { TeamActor } from "@/kernel/identity/team-auth";
import { assignAnswersToMeetings, buildBragDocument, type BragMeeting } from "../history-shared";
import { myProfileId } from "./member";
import { getMyNotes } from "./member-notes";
import { heldLate } from "../missed";
import type { OneOnOneStatus } from "../types";

// The member's History tab (K.17, spec 2.5): the last twelve 1-1s that were
// actually held, each with what the member wrote before it, the shared recap
// published after it, and how many of that meeting's commitments were kept.
//
// It lives beside member.ts rather than inside it because member.ts is at its
// 400-line cap, and because history is a different read: it walks meetings,
// where getMyCoaching walks the live state of one profile.
//
// Member tier throughout: prep_markdown, summary_markdown and the transcript
// are coach-only and are never selected here.

export const HISTORY_MEETINGS = 12;

export type HistoryMeeting = {
  id: string;
  heldOn: string;
  // Null for a meeting whose recap was never published. The meeting still
  // shows: it happened, and the member's own answers are theirs to read.
  sharedSummaryMarkdown: string | null;
  // Where this 1-1 came from, when it was moved (K.33); null when it never was.
  movedFrom: string | null;
  moveReason: string | null;
  // True when this 1-1 was booked for a day it did not happen on and was marked
  // held later (K.36); false on a 1-1 that ran when it was booked. The decision
  // is lib/missed.ts's, not this row's: the two columns behind it do not travel.
  heldLate: boolean;
  // "written" when the answers plus the coach's reply counted as the 1-1 (K.35).
  heldSource: "meeting" | "written" | null;
  movedMd: string | null;
  stuckMd: string | null;
  talkMd: string | null;
  // Commitments made on this meeting, dropped ones excluded, and how many of
  // them were kept. Counts of cards, never of a person (CLAUDE.md).
  made: number;
  kept: number;
  keptTitles: string[];
};

type MeetingRow = {
  id: string;
  held_on: string;
  shared_summary_markdown: string | null;
  moved_from: string | null;
  move_reason: string | null;
  status: OneOnOneStatus;
  marked_held_on: string | null;
  held_source: string | null;
};
type CommitmentRow = { one_on_one_id: string | null; title: string; status: string };
// K.15 adds moved_md, stuck_md and talk_md to coaching_checkins. Until that
// migration lands the columns are not in the generated types and the select
// fails; the shape is declared here and the failure is read as "no answers
// written yet", so History works on either side of that card.
type CheckinAnswerRow = {
  id: string;
  sent_at: string;
  moved_md: string | null;
  stuck_md: string | null;
  talk_md: string | null;
};

export async function getMyHistory(actor: TeamActor): Promise<HistoryMeeting[]> {
  const profileId = await myProfileId(actor);
  if (!profileId) return [];
  return historyForProfile(profileId);
}

// The same read for a profile the caller has already proven the actor may see:
// their own (getMyHistory above) or, on the quarter in review, one their coach
// owns (K.26). The guard stays with the caller so this function is never the
// place a profile id from a URL slips through unchecked.
export async function historyForProfile(profileId: string, limit = HISTORY_MEETINGS): Promise<HistoryMeeting[]> {
  const { data: meetingData, error: meetingError } = await companyOs
    .from("coaching_one_on_ones")
    .select("id, held_on, shared_summary_markdown, moved_from, move_reason, status, marked_held_on, held_source")
    .eq("coaching_profile_id", profileId)
    .eq("status", "held")
    .is("archived_at", null)
    .not("shared_published_at", "is", null)
    .order("held_on", { ascending: false })
    .limit(limit);
  if (meetingError) {
    console.error("[team/coaching/member-history] coaching_one_on_ones", meetingError);
    return [];
  }
  const meetings = (meetingData ?? []) as unknown as MeetingRow[];
  if (meetings.length === 0) return [];
  const ids = meetings.map((m) => m.id);

  const [commitments, answers] = await Promise.all([
    companyOs
      .from("coaching_commitments")
      .select("one_on_one_id, title, status")
      .eq("coaching_profile_id", profileId)
      .in("one_on_one_id", ids)
      .order("sort_order"),
    companyOs
      .from("coaching_checkins")
      // Explicit generics: the columns are K.15's and may not be in the
      // generated types yet (see CheckinAnswerRow).
      .select<string, CheckinAnswerRow>("id, sent_at, moved_md, stuck_md, talk_md")
      .eq("coaching_profile_id", profileId)
      .order("sent_at", { ascending: true }),
  ]);
  if (commitments.error) console.error("[team/coaching/member-history] coaching_commitments", commitments.error);
  // Not a failure worth surfacing: before K.15 these columns do not exist, and
  // after it an outage means the recap and the counts still render.
  if (answers.error) console.error("[team/coaching/member-history] coaching_checkins answers", answers.error);

  const made = new Map<string, number>();
  const kept = new Map<string, string[]>();
  for (const row of ((commitments.data ?? []) as unknown as CommitmentRow[])) {
    const id = row.one_on_one_id;
    if (!id || row.status === "dropped") continue;
    made.set(id, (made.get(id) ?? 0) + 1);
    if (row.status === "completed") kept.set(id, [...(kept.get(id) ?? []), row.title]);
  }

  const answerRows = ((answers.error ? [] : (answers.data ?? [])) as unknown as CheckinAnswerRow[]).map((r) => ({
    sentAt: r.sent_at,
    movedMd: r.moved_md ?? null,
    stuckMd: r.stuck_md ?? null,
    talkMd: r.talk_md ?? null,
  }));
  const byMeeting = assignAnswersToMeetings(
    meetings.map((m) => ({ id: m.id, heldOn: m.held_on })),
    answerRows,
  );

  return meetings.map((m) => {
    const written = byMeeting.get(m.id) ?? { movedMd: null, stuckMd: null, talkMd: null };
    const keptTitles = kept.get(m.id) ?? [];
    return {
      id: m.id,
      heldOn: m.held_on,
      sharedSummaryMarkdown: m.shared_summary_markdown?.trim() ? m.shared_summary_markdown : null,
      movedFrom: m.moved_from ?? null,
      moveReason: m.move_reason ?? null,
      heldLate: heldLate({ status: m.status, heldOn: m.held_on, markedHeldOn: m.marked_held_on ?? null }),
      heldSource: (m.held_source as "meeting" | "written" | null) ?? null,
      ...written,
      made: made.get(m.id) ?? 0,
      kept: keptTitles.length,
      keptTitles,
    };
  });
}

// The brag document (spec 2.5, §9), as markdown the browser saves as a file.
// The member's own meetings only: getMyHistory is scoped to their profile.
export async function getMyBragDocument(
  actor: TeamActor,
  memberName: string,
  generatedOn: string,
): Promise<string> {
  const [history, notes, profileId] = await Promise.all([getMyHistory(actor), getMyNotes(actor), myProfileId(actor)]);
  // The other two kinds of thing that happened (L.4, L.8). A brag document that
  // silently omits the coaching somebody received, and what people said about
  // their work, is not the document it claims to be.
  const extras = profileId ? await getTimelineExtras(actor, profileId) : [];
  // Oldest first: a brag document reads as a story forwards.
  const meetings: BragMeeting[] = [...history]
    .reverse()
    .map((m) => ({
      heldOn: m.heldOn,
      sharedSummaryMarkdown: m.sharedSummaryMarkdown,
      movedMd: m.movedMd,
      stuckMd: m.stuckMd,
      talkMd: m.talkMd,
      keptTitles: m.keptTitles,
    }));
  // getMyNotes already returns newest first, which is the order the document
  // wants: what was noticed most recently is what the member is about to say.
  return buildBragDocument({
    memberName,
    generatedOn,
    meetings,
    notes: notes.map((n) => ({ on: n.createdAt.slice(0, 10), body: n.body })),
    noticed: extras
      .filter((e) => e.kind === "noticed")
      .map((e) => ({
        on: e.on,
        body: e.noticed.body,
        writtenBy: e.noticed.writtenBy,
        valueTitle: e.noticed.valueTitle,
      })),
    sessions: extras.filter((e) => e.kind === "session").map((e) => ({ on: e.on, title: e.title })),
  });
}

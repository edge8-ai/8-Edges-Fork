import { companyOs } from "@/kernel/data/supabase";
import { letterIsOpen, quarterOf } from "../quarter-letter";
import { saigonToday } from "@/kernel/config/dates";
import type { TeamActor } from "@/kernel/identity/team-auth";
import type { GoalStatus } from "../types";
import { buildQuarterReview, type QuarterReview } from "../quarter-review";
import { historyForProfile } from "./member-history";
import { notesForProfile } from "./member-notes";
import { myProfileId } from "./member";
import { assertCoachOwnsProfile } from "./shared";
import { toMember } from "./rows";

// The quarter in review (K.26): everything one quarter of a member's coaching
// holds, for a page only that member and their coach can open.
//
// Two ways in, one read. Without `profileId` the review is the actor's own;
// with one, the actor must be that profile's coach — `assertCoachOwnsProfile`
// is the only thing that turns an id from a URL into a profile, so a member
// cannot read a colleague's quarter by guessing. Anything else answers null,
// which the route turns into notFound rather than a message that would confirm
// the profile exists.
//
// A review reaches back further than the History tab's twelve meetings,
// because an old quarter's 1-1s are exactly what has fallen off that list.
const REVIEW_MEETINGS = 200;

export type QuarterReviewPage = {
  review: QuarterReview;
  // Set only on the coach's view, where the page needs to say whose quarter it
  // is; on the member's own review the name would be their own.
  memberName: string | null;
  // The letter the member wrote to this quarter's end, unsealed because THIS is
  // the one page allowed to show it (L.10). Null when they wrote none, and null
  // for a quarter that has not ended — letterIsOpen decides, not this page.
  letter: { body: string; sealedOn: string | null } | null;
};

type GoalRow = {
  title: string;
  status: string;
  quarter_label: string | null;
  description_markdown: string | null;
  letter_md: string | null;
  letter_sealed_on: string | null;
};

export async function getQuarterReview(
  actor: TeamActor,
  quarter: string,
  profileId?: string,
): Promise<QuarterReviewPage | null> {
  let resolvedId: string | null;
  let memberName: string | null = null;
  if (profileId) {
    const row = await assertCoachOwnsProfile(actor, profileId);
    if (!row) return null;
    resolvedId = profileId;
    memberName = toMember(row).name;
  } else {
    resolvedId = await myProfileId(actor);
  }
  if (!resolvedId) return null;

  const [meetings, notes, goals] = await Promise.all([
    historyForProfile(resolvedId, REVIEW_MEETINGS),
    notesForProfile(resolvedId),
    companyOs
      .from("goals")
      .select("title, status, quarter_label, description_markdown, letter_md, letter_sealed_on")
      .eq("coaching_profile_id", resolvedId)
      .order("created_at"),
  ]);
  if (goals.error) {
    console.error("[team/coaching/quarter-review] goals", goals.error);
    return null;
  }

  const review = buildQuarterReview({
    quarter,
    goals: ((goals.data ?? []) as unknown as GoalRow[]).map((g) => ({
      title: g.title,
      status: g.status as GoalStatus,
      quarterLabel: g.quarter_label,
      descriptionMarkdown: g.description_markdown,
    })),
    meetings,
    // A note is filed under the day it was written; the builder decides which
    // quarter that day falls in.
    notes: notes.map((n) => ({ on: n.createdAt.slice(0, 10), body: n.body })),
  });
  if (!review) return null;

  // The seal opens here and nowhere else. letterIsOpen re-checks the quarter is
  // actually over, so a member who types a future quarter into the URL gets the
  // same nothing they get everywhere else.
  const today = saigonToday();
  const sealed = ((goals.data ?? []) as unknown as GoalRow[]).find((g) =>
    letterIsOpen(
      { letterMd: g.letter_md, sealedOn: g.letter_sealed_on, quarterLabel: g.quarter_label },
      quarter,
      quarterOf(today),
    ),
  );
  return {
    review,
    memberName,
    letter: sealed?.letter_md ? { body: sealed.letter_md, sealedOn: sealed.letter_sealed_on } : null,
  };
}

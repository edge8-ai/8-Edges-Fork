import { companyOs } from "@/kernel/data/supabase";
import { countOr, readOr } from "@/kernel/data/read";
import { businessDate, dateMs, saigonToday } from "@/kernel/config/dates";
import { initials } from "@/kernel/ui/format";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { computeNextReview, listReviews, type ReviewListItem } from "@/entities/team/lib/reviews";
import { DECISION_LABEL, REVIEW_TYPE_LABEL, reviewFormHref } from "@/entities/team/lib/reviews-labels";

// The Reviews page as a person meets it (TH.14): what is theirs to write, what
// waits for them to finalize, and what was said about them, each review shown
// as the path it walks (opened, their part, finalize, shared). The rows come
// from listReviews, which scopes them to the actor; this module only adds the
// dates that make a review readable (when it opened, when a probation ends,
// when the person's own next review is due) and shapes the page's model.
//
// Blind drafting holds here as everywhere: a manager's card never says whether
// the self-assessment is written, because they may read it only after they
// submit their own.

export type ReviewStep = { state: "done" | "now" | "next"; label: string; sub: string };
export type ReviewCard = {
  id: string;
  initials: string;
  who: string;
  kind: string;
  part: string;
  due: { text: string; warn: boolean };
  steps: ReviewStep[];
  note: string | null;
  cta: { label: string; href: string };
};
export type ReviewHistory = { id: string; date: string; title: string; decision: string | null; sub: string; href: string };
export type ReviewsHome = {
  headline: string;
  sub: string;
  write: ReviewCard[];
  finalize: ReviewCard[];
  finalized: ReviewHistory[];
  mine: ReviewHistory[];
  isReviewer: boolean;
  next: { month: string; year: string; type: string; when: string } | null;
};

// A probation inside two weeks of its end is the one deadline worth colour.
const WARN_DAYS = 14;

/** "Thu 15 Oct", the way the team pages name a day. */
function day(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
function monthYear(iso: string): string {
  // en-US: en-GB shortens September to "Sept".
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}
function formHref(r: ReviewListItem): string {
  return reviewFormHref(r);
}

export type HomeInput = {
  actorName: string;
  lists: { todo: ReviewListItem[]; reports: ReviewListItem[]; mine: ReviewListItem[] };
  /** Business date each row opened on, by review id. */
  opened: Map<string, string>;
  /** The subject's probation end date, by the id of the probation review that waits on the actor. */
  probationEnds: Map<string, string>;
  next: { type: string; date: string } | null;
  todayISO: string;
};

function daysUntil(iso: string, todayISO: string): number {
  return Math.round((dateMs(iso) - dateMs(todayISO)) / 86_400_000);
}
/** "their probation ends Sun 1 Nov, in 13 days", for the hero's line. */
function probationWhen(ends: string, todayISO: string): string {
  const left = daysUntil(ends, todayISO);
  if (left < 0) return `their probation ended ${day(ends)}`;
  return left === 0 ? "their probation ends today" : `their probation ends ${day(ends)}, in ${left === 1 ? "1 day" : `${left} days`}`;
}

function dueOf(r: ReviewListItem, input: HomeInput): ReviewCard["due"] {
  const ends = r.reviewType === "probation" ? input.probationEnds.get(r.id) : undefined;
  if (ends) {
    const left = daysUntil(ends, input.todayISO);
    if (left < 0) return { text: `Probation ended ${day(ends)}`, warn: true };
    const days = left === 0 ? "today" : left === 1 ? "1 day left" : `${left} days left`;
    return { text: `Probation ends ${day(ends)} · ${days}`, warn: left <= WARN_DAYS };
  }
  const opened = input.opened.get(r.id);
  return { text: opened ? `Open since ${day(opened)}` : "Open", warn: false };
}

function writeCard(r: ReviewListItem, input: HomeInput): ReviewCard {
  const kind = REVIEW_TYPE_LABEL[r.reviewType] ?? "Review";
  const opened = input.opened.get(r.id);
  const draft = r.status === "draft";
  const openedStep: ReviewStep = { state: "done", label: "Opened", sub: opened ? day(opened) : "" };
  const yours = draft ? "Draft started" : "Not started";
  if (r.raterKind === "self") {
    return {
      id: r.id, initials: initials(input.actorName), who: "You", kind, part: "Your part: self-assessment",
      due: dueOf(r, input),
      steps: [openedStep, { state: "now", label: "Your self-assessment", sub: yours },
        { state: "next", label: "Manager’s review", sub: "Your manager writes theirs" }, { state: "next", label: "Shared with you", sub: "Once they finalize" }],
      note: "Your manager reads it only after they have written theirs.",
      cta: { label: draft ? "Continue self-assessment" : "Start self-assessment", href: formHref(r) },
    };
  }
  // Named as people-name.ts writes them; a first name would mean splitting it here.
  const them = r.subjectName;
  if (r.raterKind === "manager") {
    return {
      id: r.id, initials: initials(r.subjectName), who: r.subjectName, kind, part: "Your part: manager review",
      due: dueOf(r, input),
      steps: [openedStep, { state: "now", label: "Your review", sub: yours },
        { state: "next", label: "Finalize and decide", sub: r.reviewType === "probation" ? "Continue, extend or stop" : r.reviewType === "renewal" ? "Renew, change or end" : "Once you submit" },
        { state: "next", label: `Shared with ${them}`, sub: "Once you finalize" }],
      note: `${them} writes a self-assessment on their own. You read it after you submit yours.`,
      cta: { label: draft ? "Continue draft" : "Start review", href: formHref(r) },
    };
  }
  return {
    id: r.id, initials: initials(r.subjectName), who: r.subjectName, kind, part: "Your part: feedback",
    due: dueOf(r, input),
    steps: [openedStep, { state: "now", label: "Your feedback", sub: yours },
      { state: "next", label: "Manager finalizes", sub: `${them}’s manager` }, { state: "next", label: `Shared with ${them}`, sub: "Once finalized" }],
    note: `Your feedback goes to ${them}’s manager, who finalizes the review. ${them} reads it only then.`,
    cta: { label: draft ? "Continue feedback" : "Give feedback", href: formHref(r) },
  };
}

function finalizeCard(r: ReviewListItem, input: HomeInput): ReviewCard {
  const opened = input.opened.get(r.id);
  const submitted = r.submittedAt ? day(businessDate(r.submittedAt)) : null;
  const them = r.subjectName;
  return {
    id: r.id, initials: initials(r.subjectName), who: r.subjectName, kind: REVIEW_TYPE_LABEL[r.reviewType] ?? "Review", part: "Your part: decide",
    due: { text: `You submitted your review${submitted ? ` ${submitted}` : ""}. ${them}’s self-assessment is yours to read now.`, warn: false },
    steps: [{ state: "done", label: "Opened", sub: opened ? day(opened) : "" }, { state: "done", label: "Your review", sub: submitted ? `Submitted ${submitted}` : "Submitted" },
      { state: "now", label: "Finalize and decide", sub: r.reviewType === "probation" ? "Continue, extend or stop" : r.reviewType === "renewal" ? "Renew, change or end" : "Finalize to share it" },
      { state: "next", label: `Shared with ${them}`, sub: "Once you finalize" }],
    note: null,
    cta: { label: "Read and finalize", href: `/team/reviews/${r.id}` },
  };
}

function history(r: ReviewListItem, title: string, sub: string): ReviewHistory {
  return {
    id: r.id, date: r.submittedAt ? monthYear(businessDate(r.submittedAt)) : "", title,
    decision: r.decision ? (DECISION_LABEL[r.decision] ?? null) : null, sub, href: `/team/reviews/${r.id}`,
  };
}

/** The page's model from the scoped rows and their dates. Pure, so the page's rules are tested without a database. */
export function toReviewsHome(input: HomeInput): ReviewsHome {
  const write = input.lists.todo.map((r) => writeCard(r, input));
  const toFinalize = input.lists.reports.filter((r) => r.status === "submitted");
  const finalize = toFinalize.map((r) => finalizeCard(r, input));
  const finalized = input.lists.reports
    .filter((r) => r.status === "finalized")
    .map((r) => history(r, `${r.subjectName} · ${REVIEW_TYPE_LABEL[r.reviewType] ?? "Review"}`, "You finalized it"));
  const mine = input.lists.mine.map((r) =>
    r.raterKind === "self"
      ? history(r, `${REVIEW_TYPE_LABEL[r.reviewType] ?? "Review"}: your self-assessment`, "Submitted · your manager’s review appears once they finalize it")
      : history(r, REVIEW_TYPE_LABEL[r.reviewType] ?? "Review", "Finalized by your manager"),
  );
  const nW = write.length, nF = finalize.length;
  const headline = nW === 1 ? "1 review is yours to write." : nW > 1 ? `${nW} reviews are yours to write.`
    : nF === 1 ? "1 review is ready to finalize." : nF > 1 ? `${nF} reviews are ready to finalize.` : "Nothing to write right now.";
  // The sub names what comes first: the nearest probation end, else the oldest open review.
  const first = [...input.lists.todo].sort((a, b) => {
    const ka = input.probationEnds.get(a.id) ?? `9${input.opened.get(a.id) ?? ""}`;
    const kb = input.probationEnds.get(b.id) ?? `9${input.opened.get(b.id) ?? ""}`;
    return ka.localeCompare(kb);
  })[0];
  let sub = "Reviews open on their own dates and land here and in your Inbox.";
  if (first) {
    const ends = input.probationEnds.get(first.id);
    sub = first.raterKind === "self" ? `Your ${REVIEW_TYPE_LABEL[first.reviewType]?.toLowerCase() ?? "review"} comes first.`
      : ends ? `${first.subjectName}’s probation review comes first: ${probationWhen(ends, input.todayISO)}.`
      : `${first.subjectName}’s ${REVIEW_TYPE_LABEL[first.reviewType]?.toLowerCase() ?? "review"} comes first.`;
  }
  if (nW > 0 && nF > 0) sub += nF === 1 ? " One more waits for you to finalize." : ` ${nF} more wait for you to finalize.`;
  const next = input.next
    ? {
        month: new Date(`${input.next.date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
        year: input.next.date.slice(0, 4),
        type: REVIEW_TYPE_LABEL[input.next.type as keyof typeof REVIEW_TYPE_LABEL] ?? "Review",
        when: `around ${day(input.next.date)} ${input.next.date.slice(0, 4)}`,
      }
    : null;
  return { headline, sub, write, finalize, finalized, mine, isReviewer: write.some((c) => c.part !== "Your part: self-assessment") || input.lists.reports.length > 0, next };
}

/**
 * Reads the page. A failed list read throws (listReviews), because an empty
 * list would say "nothing to write" when that is not known; the dates are
 * read with a fallback, because a missing date only drops a label.
 */
export async function reviewsHome(actor: TeamActor): Promise<ReviewsHome> {
  const lists = await listReviews(actor);
  const rows = [...lists.todo, ...lists.reports, ...lists.mine];
  const ids = rows.map((r) => r.id);
  const todayISO = saigonToday();

  const [openedRows, me, probationCount] = await Promise.all([
    ids.length
      ? companyOs.from("performance_reviews").select("id, team_member_id, created_at").in("id", ids)
      : Promise.resolve({ data: [], error: null }),
    companyOs.from("team_members").select("start_date, contract_start_date").eq("id", actor.teamMemberId).maybeSingle(),
    companyOs.from("performance_reviews").select("id", { count: "exact", head: true }).eq("team_member_id", actor.teamMemberId).eq("review_type", "probation"),
  ]);
  const reviewRows = readOr(openedRows, "[team/reviews] opened dates", [] as Array<{ id: string; team_member_id: string; created_at: string }>) as Array<{
    id: string;
    team_member_id: string;
    created_at: string;
  }>;
  const opened = new Map(reviewRows.map((r) => [r.id, businessDate(r.created_at)]));

  // Probation end dates of the subjects whose probation review waits on the actor.
  const probationIds = new Set(lists.todo.filter((r) => r.reviewType === "probation").map((r) => r.id));
  const subjectByReview = new Map(reviewRows.filter((r) => probationIds.has(r.id)).map((r) => [r.id, r.team_member_id]));
  const probationEnds = new Map<string, string>();
  if (subjectByReview.size) {
    const subjects = readOr(
      await companyOs.from("team_members").select("id, probation_ends_on").in("id", [...new Set(subjectByReview.values())]),
      "[team/reviews] probation end dates",
      [] as Array<{ id: string; probation_ends_on: string | null }>,
    ) as Array<{ id: string; probation_ends_on: string | null }>;
    const endsBySubject = new Map(subjects.map((s) => [s.id, s.probation_ends_on]));
    for (const [reviewId, subjectId] of subjectByReview) {
      const ends = endsBySubject.get(subjectId);
      if (ends) probationEnds.set(reviewId, ends.slice(0, 10));
    }
  }

  const member = readOr(me, "[team/reviews] own review dates", null) as { start_date: string | null; contract_start_date: string | null } | null;
  const next = member
    ? computeNextReview({
        startDate: member.start_date ? member.start_date.slice(0, 10) : null,
        contractStartDate: member.contract_start_date ? member.contract_start_date.slice(0, 10) : null,
        hasProbationReview: countOr(probationCount, "[team/reviews] own probation reviews", 1) > 0,
        todayISO,
      })
    : null;

  return toReviewsHome({ actorName: actor.displayName, lists, opened, probationEnds, next, todayISO });
}

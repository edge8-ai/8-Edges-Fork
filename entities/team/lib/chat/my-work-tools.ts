// Server-only. The team assistant's "my" tools over the person's own work and
// growth: their Workboard week, their FAST goals, their performance reviews
// and their coaching (2026-10-10).
//
// The rule the owner set: private records stay private from colleagues, and
// each person sees all of their own. So every tool here takes the signed-in
// TeamActor the route resolved from the session, and nothing in the tool input
// can name anybody else: the model supplies no person id, and any it sends is
// ignored because no body reads one. Where a read is this file's own query it
// is filtered to the actor in SQL and again in code, so a wrong row from the
// database still never reaches the model.
//
// Each tool reuses the reader the person's own page uses, through its entity's
// door, so the assistant and the page can never describe the same person
// differently, and the page's member-tier limits hold here too: no coach-only
// 1-1 prep, summary or transcript, and a sealed goal letter stays sealed.

import { mustRows } from "@/kernel/data/read";
import { companyOs } from "@/kernel/data/supabase";
import { saigonToday } from "@/kernel/config/dates";
import { cardSlug } from "@/kernel/config/slug";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { myWeek, readMyWeek, sprintStartOf, summaryLine } from "@/entities/boards";
import { getMyCoaching, getMyGoals, getMyHistory, getMyNotes } from "@/entities/coaching";
import { selectKeyResults } from "@/entities/org";
import { ok, type ToolInput, type ToolOutcome } from "./shared";

/** The signed-in person, from the session. The only "who" a my_* tool knows. */
export type ChatSelf = TeamActor;

const clip = (s: string | null | undefined, max = 1200) => (s && s.length > max ? `${s.slice(0, max)}…` : (s ?? null));
const RECENT_DONE = 10;

// ---- my_work -----------------------------------------------------------------

export async function myWork(_input: ToolInput, me: ChatSelf): Promise<ToolOutcome> {
  const today = saigonToday();
  const raw = await readMyWeek(me.personId, sprintStartOf(today));
  // The read is already the person's own; the cards are narrowed again so a
  // wrong row can never be described as theirs. Blockers keep the card they
  // hold up, which is somebody else's by design ("waiting on you").
  const read = { ...raw, cards: raw.cards.filter((c) => c.assignee_id === me.personId) };
  const model = myWeek(read, today);
  type Row = (typeof model.now)[number];
  const row = (r: Row) => ({
    title: r.title,
    priority: r.priority,
    where: r.place,
    due: r.due,
    lateDays: r.lateDays,
    inProgress: r.doing,
    carriedFrom: r.carried ? (r.carriedFrom ?? "an earlier sprint") : null,
    newToYou: r.fresh,
    waitingOnYouFor: r.waitingOn,
    humanTokens: r.ht,
    link: r.href,
  });

  // Cards on boards that do not run weekly sprints are only counted by the
  // week model; the assistant lists them so "what should I focus on" sees all
  // open work, not just this sprint's.
  const listed = new Set([...model.doing, ...model.now, ...model.fresh, ...model.later, ...model.undated, ...model.days.flatMap((d) => d.open)].map((r) => r.id));
  const boardOf = new Map(read.boards.map((b) => [b.id, b]));
  const placeOf = (boardId: string | null) => {
    const b = boardId ? boardOf.get(boardId) : undefined;
    return b ? [b.client_name, b.name].filter(Boolean).join(" · ") : null;
  };
  const linkOf = (boardId: string | null, title: string, id: string) => {
    const b = boardId ? boardOf.get(boardId) : undefined;
    return b ? `/team/boards/${b.slug}?card=${cardSlug(title, id)}` : null;
  };
  const otherOpen = read.cards
    .filter((c) => c.status === "open" && !listed.has(c.id))
    .map((c) => ({ title: c.title, priority: c.priority, where: placeOf(c.board_id), due: c.due_date, humanTokens: c.human_tokens, link: linkOf(c.board_id, c.title, c.id) }));
  const recentlyDone = read.cards
    .filter((c) => c.status === "done" && c.completed_at)
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))
    .slice(0, RECENT_DONE)
    .map((c) => ({ title: c.title, where: placeOf(c.board_id), completedAt: c.completed_at, link: linkOf(c.board_id, c.title, c.id) }));

  return ok({
    today,
    sprint: { week: model.week, startsOn: model.window.startsOn, endsOn: model.window.endsOn, lastDay: model.isLastDay },
    summary: summaryLine(model),
    counts: model.counts,
    openHumanTokens: model.openTokens,
    unsizedOpenCards: model.unsized,
    inProgress: model.doing.map(row),
    today_lateDueTodayAndWaitingOnYou: model.now.map(row),
    newToYou: model.fresh.map(row),
    laterThisSprint: model.days.filter((d) => d.open.length > 0).map((d) => ({ date: d.date, cards: d.open.map(row) })),
    afterThisSprint: model.later.map(row),
    noDueDate: model.undated.map(row),
    openOnBoardsWithoutSprints: otherOpen,
    recentlyDone,
    page: "/team/my-week",
  });
}

// ---- my_goals ----------------------------------------------------------------

export async function myGoals(_input: ToolInput, me: ChatSelf): Promise<ToolOutcome> {
  const goals = await getMyGoals(me);
  const krIds = [...new Set(goals.flatMap((g) => (g.ladder?.kind === "key_result" ? [g.ladder.id] : [])))];
  const krs = krIds.length
    ? (mustRows(
        await selectKeyResults("id, title, current_value, target_value, unit, status").in("id", krIds),
        "[team/chat] my goals key results",
      ) as { id: string; title: string; current_value: number; target_value: number | null; unit: string | null; status: string }[])
    : [];
  const krById = new Map(krs.map((k) => [k.id, k]));
  const progress = (start: number | null, target: number | null, current: number | null) =>
    start === null || target === null || current === null || target === start ? null : Math.round(((current - start) / (target - start)) * 100);

  return ok({
    goals: goals.map((g) => {
      const kr = g.ladder?.kind === "key_result" ? krById.get(g.ladder.id) : undefined;
      return {
        title: g.title,
        status: g.status,
        quarter: g.quarterLabel,
        due: g.dueDate,
        description: clip(g.descriptionMarkdown),
        stretch: clip(g.stretchMarkdown),
        measure: g.metricUnit || g.targetValue !== null ? { unit: g.metricUnit, start: g.startValue, target: g.targetValue, current: g.currentValue } : null,
        progressPercent: progress(g.startValue, g.targetValue, g.currentValue),
        laddersTo: g.ladder ? { kind: g.ladder.kind, label: g.ladder.label } : null,
        companyKeyResult: kr ? { title: kr.title, current: kr.current_value, target: kr.target_value, unit: kr.unit, status: kr.status } : null,
        comments: g.comments.map((c) => ({ by: c.authorName, at: c.createdAt, body: clip(c.body, 500) })),
        // The letter to the end-of-quarter self is sealed until that quarter's
        // review page opens it (letterIsOpen), so it is never handed over here.
      };
    }),
    page: "/team/goals",
  });
}

// ---- my_reviews --------------------------------------------------------------

type MyReviewRow = {
  id: string;
  team_member_id: string;
  cycle_label: string | null;
  review_type: string;
  rater_kind: string;
  reviewer_name: string | null;
  status: string;
  submitted_at: string | null;
  period_start: string | null;
  period_end: string | null;
  overall_rating: string | null;
  rating_scale: string | null;
  ratings: unknown;
  achievements: string | null;
  improvements: string | null;
  comments: string | null;
  summary: string | null;
  decision: string | null;
  keeper: boolean | null;
  acknowledged_at: string | null;
};

const REVIEW_SELECT =
  "id, team_member_id, cycle_label, review_type, rater_kind, reviewer_name, status, submitted_at, period_start, period_end, overall_rating, rating_scale, ratings, achievements, improvements, comments, summary, decision, keeper, acknowledged_at";

/**
 * What /team/reviews opens for the subject (getReviewDetail): their own
 * self-assessment at any stage, and their manager's review once it is
 * finalized. The assistant shows more than the page (Dave, 2026-10-10: every
 * review about you is yours, drafts and other reviewers included), so this
 * now decides only which rows get a link to the page.
 */
export function subjectMaySee(r: Pick<MyReviewRow, "rater_kind" | "status">): boolean {
  if (r.rater_kind === "self") return true;
  return r.rater_kind === "manager" && (r.status === "finalized" || r.status === "acknowledged");
}

const SIDES: Record<string, string> = {
  self: "your self-assessment",
  manager: "your manager's review",
  reviewer: "another reviewer's review",
  external: "an external reviewer's review",
};

export async function myReviews(_input: ToolInput, me: ChatSelf): Promise<ToolOutcome> {
  const rows = mustRows(
    await companyOs
      .from("performance_reviews")
      .select(REVIEW_SELECT)
      .eq("team_member_id", me.teamMemberId)
      .order("submitted_at", { ascending: false, nullsFirst: true }),
    "[team/chat] my reviews",
  ) as MyReviewRow[];
  const mine = rows.filter((r) => r.team_member_id === me.teamMemberId);
  return ok({
    reviews: mine.map((r) => ({
      cycle: r.cycle_label,
      type: r.review_type,
      side: SIDES[r.rater_kind] ?? r.rater_kind,
      // The reviewer's name, never their email or access token: an external
      // reviewer's address is a client contact detail.
      reviewer: r.rater_kind === "self" ? null : r.reviewer_name,
      status: r.status,
      submittedAt: r.submitted_at,
      period: r.period_start || r.period_end ? { from: r.period_start, to: r.period_end } : null,
      overallRating: r.overall_rating,
      ratingScale: r.rating_scale,
      ratings: r.ratings,
      achievements: clip(r.achievements),
      improvements: clip(r.improvements),
      comments: clip(r.comments),
      summary: clip(r.summary),
      decision: r.decision,
      keeper: r.keeper,
      acknowledgedAt: r.acknowledged_at,
      link: subjectMaySee(r) ? `/team/reviews/${r.id}` : null,
    })),
    page: "/team/reviews",
  });
}

// ---- my_coaching -------------------------------------------------------------

const RECENT = 6;

export async function myCoaching(_input: ToolInput, me: ChatSelf): Promise<ToolOutcome> {
  // Member tier only: getMyCoaching and getMyHistory never select the coach's
  // prep, summary, transcript or voltage note, and the OCEAN profile only once
  // the coach published it.
  const [my, history, notes] = await Promise.all([getMyCoaching(me), getMyHistory(me), getMyNotes(me)]);
  if (!my) return ok({ coaching: null, note: "You have no coaching profile yet.", page: "/team/my-coaching" });
  return ok({
    coach: my.coachName,
    cadenceDays: my.cadenceDays,
    next1to1: { on: my.nextOneOnOneOn, startsAt: my.nextStartsAt, suggestedOn: my.suggestedOn, youProposed: my.proposedOn, missedOn: my.missedOn },
    prepForNext1to1: clip(my.nextPrepMarkdown, 2000),
    yourPrepEdits: my.nextPrepEdits,
    preMeetingForm: my.preMeeting,
    growthPriorities: my.priorities.map((p) => ({ title: p.title, status: p.status, detail: clip(p.detailMarkdown, 600), laddersTo: p.ladder?.label ?? null })),
    commitments: my.commitments.map((c) => ({ title: c.title, owner: c.owner, due: c.dueOn, status: c.status, note: c.statusNote })),
    openTalkingPoints: my.talkingPoints.map((t) => t.body),
    recentCheckins: my.checkins.slice(0, RECENT).map((c) => ({ sentAt: c.sentAt, respondedAt: c.respondedAt, moved: c.moved, stuck: c.stuck, talk: c.talk, coachNote: c.coachNote })),
    held1to1s: history.slice(0, RECENT).map((h) => ({
      heldOn: h.heldOn,
      sharedRecap: clip(h.sharedSummaryMarkdown, 1500),
      commitmentsMade: h.made,
      commitmentsKept: h.kept,
    })),
    yourNotes: notes.slice(0, 20).map((n) => ({ at: n.createdAt, body: n.body })),
    ocean: my.ocean,
    howIWork: my.howIWork,
    page: "/team/my-coaching",
  });
}

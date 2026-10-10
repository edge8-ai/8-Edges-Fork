import type { TeamActor } from "@/kernel/identity/team-auth";
import { saigonToday } from "@/kernel/config/dates";
import { getMyCoaching } from "./member";
import { getMyHistory } from "./member-history";
import { getMyGoals } from "./my-goals";
import { getEdgesLadderOptions } from "./goals";
import { getMyNotes } from "./member-notes";
import { getGoalBumpFacts, getGoalMoveSince } from "./goal-bumps";
import { getGoalAlignmentMeasures } from "./goal-alignment";
import { getGoalLadder } from "./member-ladder";
import { getSharedKeyResultGoals } from "./shared-key-result";
import { getCardsCompletedSince } from "./moved-cards";
import { getTimelineExtras } from "./my-timeline";
import { coachingMarkdownToHtml } from "../markdown";
import { buildGoalChain, chainRungs } from "../goal-chain";
import { memberAgendaOpen, preMeetingAnswered } from "../member-agenda";
import { isFirstVisit } from "../history-shared";
import { personalRecords, ringState, unlocks } from "../growth";
import { nextStep } from "../next-step";
import { sinceLine } from "../since-line";
import { toMyGoalRow } from "../my-goal-row";

// Everything /team/my-coaching shows, in one call (A.11).
//
// This assembly used to live in the route body, where nothing could test it:
// a Next route function has no interface, so the eleven facts derived here were
// reachable only by rendering the page. The coach's side has had the deeper
// shape since it was written — getCoachProfileDetail returns one object and its
// route is seventy-four lines — and this is the member's half of that shape.
//
// It composes getMyCoaching rather than extending it. The team hub calls that
// primitive too and reads six of its two dozen fields; folding a whole page
// model into it would make the hub pay for a page it does not render.
//
// TWO FACTS THE PAGE NEEDS ARE NOT HERE, and both are pinned by a boundary rule
// rather than by preference:
//   - the open review cycle, because its fetch crosses into team and coaching
//     may never import team (team requires coaching, not the reverse). A route
//     body sits outside the door graph, which is the only place that import is
//     legal.
//   - the goals panel, because it renders a component under routes/, which
//     lib/ may not import.
// Both stay in the route. Splitting either one's pure half out to live here
// would buy nothing and would invite a later edit to "finish the job" and trip
// the entity gate.
export async function getMyCoachingPage(actor: TeamActor) {
  const my = await getMyCoaching(actor);
  // Null means no coaching profile at all; the route decides what to do about
  // that, because redirecting is a routing concern rather than a data one.
  if (!my) return null;

  const [history, goals, edges, notes] = await Promise.all([
    getMyHistory(actor),
    getMyGoals(actor),
    getEdgesLadderOptions(),
    getMyNotes(actor),
  ]);

  const activeGoal = my.goals.find((g) => g.status === "active") ?? null;
  // The last 1-1 that actually happened is the page's "since when" for
  // everything the member has not seen yet: the notes, the moved cards, and
  // from K.43 the company key result's own movement.
  const lastHeldOn = history[0]?.heldOn ?? null;

  // Everything else the page needs, in one round. These nine depend on the four
  // above and on nothing from each other, so the only thing sequencing them
  // ever bought was waiting. Each guard still decides whether its read happens
  // at all, and a guard that fails substitutes a value rather than calling out:
  //
  //   the bump and alignment facts (K.62): how often each goal's number moved
  //     and when it last did, and where the company key result it lifts stands.
  //     One read each for the whole tab rather than one per card.
  //   the rendered markdown: every shared recap and the member's copy of the
  //     prep, turned to html once here rather than in the browser.
  //   the goal ladder: the rung paragraph is the coach's guidance where there
  //     is some — the top growth priority's detail, else what the member wrote.
  //   the shared bet (L.5): who else is lifting the company key result this
  //     member's goal ladders to. A goal laddering to nothing asks nobody.
  //   the moved cards (K.20): what the member finished since the last meeting,
  //     read off the Workboard on the same Saigon cut-off the notes use.
  //   the timeline extras (L.4, L.8): group sessions attended, and what has
  //     been noticed about their work.
  //   the goal's movement (K.42): the value at the first bump after the last
  //     meeting and the value now. No meeting or no goal, nothing to compare.
  const [bumpFacts, alignMeasures, historyHtml, nextPrepHtml, rungs, sharedGoals, movedCards, extras, goalMove] =
    await Promise.all([
      getGoalBumpFacts(goals.map((g) => g.id)),
      getGoalAlignmentMeasures(goals),
      Promise.all(history.map((m) => (m.sharedSummaryMarkdown ? coachingMarkdownToHtml(m.sharedSummaryMarkdown) : Promise.resolve(null)))),
      my.nextPrepMarkdown ? coachingMarkdownToHtml(my.nextPrepMarkdown) : Promise.resolve(null),
      activeGoal
        ? getGoalLadder(activeGoal, my.priorities[0]?.detailMarkdown ?? null, lastHeldOn)
        : Promise.resolve([]),
      activeGoal?.ladder?.kind === "key_result"
        ? getSharedKeyResultGoals(activeGoal.ladder.id, activeGoal.id)
        : Promise.resolve([]),
      getCardsCompletedSince(actor, lastHeldOn),
      getTimelineExtras(actor, my.profileId),
      lastHeldOn && activeGoal ? getGoalMoveSince(activeGoal.id, lastHeldOn) : Promise.resolve(null),
    ]);

  // The goal rows the panel renders, mapped here rather than in the route: the
  // two reads above come back as Maps, and a Map is a poor thing to hand across
  // the client boundary. Mapping here keeps them on the server, where they were.
  const goalRows = goals.map((g) => {
    const bumps = bumpFacts.get(g.id);
    return toMyGoalRow(g, actor.teamMemberId, {
      bumps: bumps?.count ?? 0,
      lastBumpAt: bumps?.lastAt ?? null,
      alignMeasure: (g.ladder?.kind === "key_result" && alignMeasures.get(g.ladder.id)) || null,
    });
  });

  // The goal chain (K.25) is the earlier steps of the same path: past quarters'
  // goals sit just below the current goal rung, between the key result and the
  // goal, so the path reads objective, key result, Q1's goal, Q2's goal, this
  // quarter's goal, next. It travels as more rungs rather than as a prop of its
  // own. getMyGoals is the member tier reading their own profile, and it
  // already carries every status, which is what the chain needs. It is only
  // drawn when there is an active goal: with no goal the ascent is the empty
  // state, and that shape stays as it is.
  const ascent = activeGoal
    ? (() => {
        const goalAt = rungs.findIndex((r) => r.kind === "goal");
        const chain = chainRungs(buildGoalChain(goals, activeGoal));
        return goalAt < 0 ? [...rungs, ...chain] : [...rungs.slice(0, goalAt), ...chain, ...rungs.slice(goalAt)];
      })()
    : rungs;

  const meetings = history.map((m, i) => ({
    id: m.id,
    heldOn: m.heldOn,
    sharedSummaryMarkdown: m.sharedSummaryMarkdown,
    html: historyHtml[i],
    movedFrom: m.movedFrom,
    moveReason: m.moveReason,
    heldLate: m.heldLate,
    heldSource: m.heldSource,
    movedMd: m.movedMd,
    stuckMd: m.stuckMd,
    talkMd: m.talkMd,
    made: m.made,
    kept: m.kept,
  }));

  // The agenda opens four days out, or as soon as the form carries an answer:
  // once something is written it has to stay readable and editable, whatever
  // the date maths says. Saigon dates, like the rest of the cycle. This is the
  // same rule the team hub asks (L.7), so the two screens can never disagree
  // about whether this member's form is open.
  const { answers } = my.preMeeting;
  const answered = preMeetingAnswered(answers);
  const agendaOpen = memberAgendaOpen({ nextOn: my.nextOneOnOneOn, answered }, saigonToday());

  // "N kept since <last 1-1>": cards the member closed since the last meeting,
  // counted from when each card was last moved. A count of cards, not of a
  // person, and zero before the first 1-1.
  const keptSince = my.commitments.filter(
    (c) =>
      c.owner === "member" &&
      c.status === "completed" &&
      (!lastHeldOn || (c.statusUpdatedAt ?? "") >= lastHeldOn),
  ).length;

  // The notes worth offering as a draft on the next 1-1 are the ones written
  // since the last meeting actually happened: anything older was already said
  // out loud. Decided on the server because held_on is a Saigon date and
  // created_at a timestamp, and that comparison belongs where the rest of the
  // cycle's date maths lives.
  const recentNotes = notes
    .filter((n) => !lastHeldOn || n.createdAt.slice(0, 10) > lastHeldOn)
    .map((n) => n.body);

  // "Since Tuesday" (K.44): one sentence of what the member has done since the
  // last 1-1, composed from facts already loaded above.
  const sinceLastOneOnOne = lastHeldOn
    ? sinceLine(
        {
          lastHeldOn,
          kept: keptSince,
          notes: recentNotes.length,
          goal: goalMove && activeGoal ? { ...goalMove, unit: activeGoal.metricUnit } : null,
          cards: movedCards.length,
        },
        saigonToday(),
      )
    : null;

  // Gamification within the rules (K.30): every figure below is about the
  // member's own cards, meetings and goal, and nothing is stored.
  const growth = {
    ring: ringState(my.commitments, history[0]?.id ?? null),
    totalKept: my.commitments.filter((c) => c.owner === "member" && c.status === "completed").length,
    unlocks: unlocks({ heldMeetings: history.length, goalsSaved: my.goals.length }),
    nextStep: nextStep({
      activeGoals: my.goals.filter((g) => g.status === "active").length,
      hasNextDate: Boolean(my.nextOneOnOneOn),
      formOpen: agendaOpen,
      answered,
      blocked: my.commitments.filter((c) => c.owner === "member" && c.status === "blocked").length,
      onIt: my.commitments.filter((c) => c.owner === "member" && ["open", "on_track", "needs_attention"].includes(c.status)).length,
      heldMeetings: history.length,
    }),
    records: personalRecords({
      meetings: history.map((m) => ({ heldOn: m.heldOn, kept: m.kept, made: m.made })),
      goals: my.goals,
      forms: my.checkins,
    }),
  };

  const firstVisit = isFirstVisit({
    activeGoals: my.goals.filter((g) => g.status === "active").length,
    heldMeetings: history.length,
  });

  // Two groups, because there are two consumers and they need different things.
  //
  // `view` is what the client component renders, and it is handed over whole —
  // so anything in it crosses into the browser whether the view reads it or
  // not. `panel` is the route's: the goals panel renders a component under
  // routes/, which lib/ may not import, so the route has to build it and needs
  // its two inputs. Those inputs already reach the browser inside the panel's
  // own props; carrying them in `view` as well would send them twice.
  //
  // Within `view`, what was loaded sits at the top level and what was worked
  // out is grouped and named. A reader asking "where does this number come
  // from" should not have to trace it — the coach's equivalent has no such
  // split to make, because it is loaded rows end to end.
  return {
    panel: { goalRows, edges },
    view: {
      // ─── Loaded ─────────────────────────────────────────────────────────
      my,
      notes,
      sharedGoals,
      extras,

      // ─── Derived ────────────────────────────────────────────────────────
      ascent,
      meetings,
      firstVisit,
      // The K.30 growth facts: the member's own cards, meetings and goal, and
      // nothing is stored.
      growth,
      // The upcoming 1-1 and its form, as one thing or nothing at all. Null
      // with no date set, which is what the page reads to decide there is
      // nothing to prepare for — the prep is rendered here once rather than in
      // the browser.
      next: my.nextOneOnOneOn
        ? {
            heldOn: my.nextOneOnOneOn,
            startsAt: my.nextStartsAt,
            agendaHtml: nextPrepHtml,
            agendaMarkdown: my.nextPrepMarkdown,
            agendaEdits: my.nextPrepEdits,
            formOpen: agendaOpen,
          }
        : null,
      // Everything that happened since the last 1-1, in one place — the
      // sentence and the three counts it is built from.
      since: { line: sinceLastOneOnOne, keptSince, recentNotes, movedCards },
    },
  };
}

// Derived from the function rather than hand-written, so the two can never
// drift: a field added to the view's half is a field the view may read. Only
// that half is named, because only that half crosses into the browser — the
// panel's group is the route's and never leaves the server whole.
//
// The view takes this type through the entity's browser door, never from here:
// this module opens with the service-role client, and a type-only import that
// later loses its `type` keyword would pull that client into the browser
// bundle.
export type MyCoachingPageModel = NonNullable<Awaited<ReturnType<typeof getMyCoachingPage>>>["view"];

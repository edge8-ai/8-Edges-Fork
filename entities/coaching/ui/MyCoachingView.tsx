"use client";

import { useState, type ReactNode } from "react";
import type { MyCoachingPageModel } from "@/entities/coaching/client";
import { stripGoal } from "@/entities/coaching/lib/strip-goal";
import { NextOneOnOnePane } from "./NextOneOnOnePane";
import { MyCoachingStrip } from "./MyCoachingStrip";
import { MyHistoryPane } from "./MyHistoryPane";
import { MyOverviewPane } from "./MyOverviewPane";
import { UnlockLine } from "./UnlockLine";
import { MyCoachingTabs } from "./MyCoachingTabs";
import { HowThisWorks } from "./HowThisWorks";

// The coachee's page (K.16): a summary strip, then four tabs — Overview,
// Next 1-1, My FAST goal, History. The server pre-renders every markdown body
// and passes it in; everything here reads from props.
//
// The goal tab renders the SAME FastGoalForm flow as /team/goals, handed in as
// a node by the route: the form's actions live under routes/, which ui/ may not
// import, and there is no second editor to keep in step (spec 2.6).

const MY_TABS = [
  { id: "overview", label: "Today" },
  { id: "my", label: "Next 1-1" },
  { id: "goals", label: "My FAST Goals" },
  { id: "history", label: "My 1-on-1 History" },
] as const;

type MyTab = (typeof MY_TABS)[number]["id"];

function validTab(raw: string | undefined): MyTab {
  return MY_TABS.some((t) => t.id === raw) ? (raw as MyTab) : "overview";
}


export function MyCoachingView({
  page,
  teamMemberId,
  reviewCycle,
  goalsPanel,
  initialTab,
}: {
  // Everything this page shows, assembled on the server in one call (A.11).
  // It used to arrive as thirty-one separate props, which meant the route knew
  // the shape of every pane below and any new fact had to be threaded through
  // by hand. The three things beside it are here because they cannot be in it.
  page: MyCoachingPageModel;
  // From the signed-in actor, which is the route's business rather than the
  // model's.
  teamMemberId: string;
  // The review cycle still being written (L.9); null most of the year. Its
  // fetch crosses into team, which coaching may never import, so the route
  // loads it and hands it in.
  reviewCycle: string | null;
  // The same FAST goal form /team/goals renders, built in the route because its
  // server actions live under routes/ and ui/ may not import them (spec 2.6).
  goalsPanel: ReactNode;
  initialTab?: string;
}) {
  // Unpacked once, here, into the names the panes below already use. The panes
  // still take their props one by one — narrowing that second seam is its own
  // change, and twenty-four of them are pass-throughs, so it is worth doing on
  // its own evidence rather than on the way past.
  const { my, growth, next, extras, sharedGoals, notes, firstVisit } = page;
  const { ascent: rungs, meetings: history } = page;
  const { line: since, keptSince, recentNotes, movedCards } = page.since;
  const {
    coachName,
    cadenceDays,
    goals,
    priorities,
    ocean,
    commitments,
    talkingPoints,
    preMeeting,
    howIWork,
    preferredTime,
    proposedOn,
    missedOn,
    suggestedOn,
    hasMet,
    coachLeave,
    myLeave,
  } = my;
  // History unlocks at the first held 1-1 (K.30); until then the tab is not
  // offered and a link to it lands on the Overview.
  const tabs = MY_TABS.filter((t) => t.id !== "history" || growth.unlocks.history);
  const [tab, setTab] = useState<MyTab>(() => {
    const t = validTab(initialTab);
    return t === "history" && !growth.unlocks.history ? "overview" : t;
  });

  // Runs on a click, so window exists; the tab rides in the URL for links.
  const selectTab = (id: MyTab) => {
    setTab(id);
    const url = new URL(window.location.href);
    if (id === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", id);
    window.history.replaceState(null, "", url.toString());
  };

  const onIt = commitments.filter((c) => c.owner === "member" && ["open", "on_track", "needs_attention"].includes(c.status)).length;
  const blocked = commitments.filter((c) => c.owner === "member" && c.status === "blocked").length;

  const counts: Partial<Record<MyTab, number>> = { goals: goals.filter((g) => g.status === "active").length };

  return (
    <div className="coach-page">
      <MyCoachingStrip
        coachName={coachName}
        cadenceDays={cadenceDays}
        nextOneOnOneOn={next?.heldOn ?? null}
        nextStartsAt={next?.startsAt ?? null}
        agendaSet={Boolean(next?.agendaHtml)}
        goal={stripGoal(goals)}
        onIt={onIt}
        blocked={blocked}
        keptSince={keptSince}
        totalKept={growth.totalKept}
        ring={growth.ring}
        lastHeldOn={history[0]?.heldOn ?? null}
        nextStep={growth.nextStep}
        onGo={selectTab}
      />

      <HowThisWorks firstVisit={firstVisit} onGo={selectTab} />
      <MyCoachingTabs tabs={tabs} active={tab} counts={counts} onSelect={selectTab} />

      {/* Keyed by tab: a switch remounts the pane and plays the crossfade (K.29). */}
      <div key={tab} className="admin-coach-profile coach-pane">
        {tab === "overview" && growth.unlocks.history && history.length === 1 && (
          <UnlockLine id="history">Your first 1-1 is behind you: History and the heatmap are open.</UnlockLine>
        )}
        {tab === "overview" && (
          <MyOverviewPane
            growth={growth}
            firstVisit={firstVisit}
            rungs={rungs}
            commitments={commitments}
            teamMemberId={teamMemberId}
            priorities={priorities}
            ocean={ocean}
            coachName={coachName}
            since={since}
            sharedGoals={sharedGoals}
            howIWork={howIWork}
            onGoToGoals={() => selectTab("goals")}
          />
        )}

        {tab === "my" && (
          <NextOneOnOnePane
            next={next}
            coachName={coachName}
            preMeeting={preMeeting}
            commitments={commitments}
            recentNotes={recentNotes}
            movedCards={movedCards}
            talkingPoints={talkingPoints}
            preferredTime={preferredTime}
            proposedOn={proposedOn}
            missedOn={missedOn}
            suggestedOn={suggestedOn}
            hasMet={hasMet}
            coachLeave={coachLeave}
            myLeave={myLeave}
          />
        )}

        {tab === "goals" && (
          // The goal the next step sends a member to write lives in this panel,
          // so the anchor is on the wrapper the route's node sits in. Since
          // K.62 the comments are inside each goal's card rather than in a
          // "Comments on your goals" section below it: a discussion detached
          // from the thing it is about is a discussion nobody opens.
          <div id="coach-goal" tabIndex={-1} className="coach-anchor">
            {goalsPanel}
          </div>
        )}

        {tab === "history" && (
          <MyHistoryPane
            meetings={history}
            extras={extras}
            reviewCycle={reviewCycle}
            notes={notes}
            records={growth.records}
            bragUnlocked={growth.unlocks.bragDocument}
            since={since}
            onGoToBoard={() => selectTab("overview")}
          />
        )}
      </div>
    </div>
  );
}

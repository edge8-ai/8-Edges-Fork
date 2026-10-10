"use client";

import { useState, useTransition } from "react";
import type { CoachProfileDetail } from "@/entities/coaching/lib/data/profile";
import type { ReactNode } from "react";
import { addTalkingPoint, savePrivateProfile } from "@/entities/coaching/lib/actions";
import { type RenderedHtml, COACH_TAB_LABELS, type CoachTab, type ActionResult } from "./coach-profile/shared";
import { offeredCoachTabs, resolveCoachTab, type CoachTabFacts } from "@/entities/coaching/lib/coach-tabs";
import { GoalsCard } from "./coach-profile/GoalsCard";
import { PrioritiesCard } from "./coach-profile/PrioritiesCard";
import { CadenceCard } from "./coach-profile/CadenceCard";
import { OceanCard } from "./coach-profile/OceanCard";
import { TheirHowIWork } from "./coach-profile/TheirHowIWork";
import { NoticedCard } from "./coach-profile/NoticedCard";
import { FirstMeeting } from "./coach-profile/FirstMeeting";
import { profileIsBare } from "@/entities/coaching/lib/profile-bare";
import { OPEN_COMMITMENT_STATUSES, type CommitmentStatus } from "@/entities/coaching/lib/types";
import { UnaskedQuestion } from "./coach-profile/UnaskedQuestion";
import { CarriedOverCard } from "./coach-profile/CarriedOverCard";
import { SessionView } from "./coach-profile/SessionView";
import { MeetingsCard } from "./coach-profile/MeetingsCard";
import { CraftCard } from "./coach-profile/CraftCard";
import { PerformanceCard } from "./coach-profile/PerformanceCard";
import { TrendsCard } from "./coach-profile/TrendsCard";
import { CheckinsCard } from "./coach-profile/CheckinsCard";
import { CompanyGoalsCard } from "./coach-profile/CompanyGoalsCard";
import { NotesCard } from "./coach-profile/NotesCard";
export { type RenderedHtml } from "./coach-profile/shared";

export function CoachProfileView({
  detail,
  html,
  reviewCount,
  reviewHistory,
  initialTab,
  todayIso,
}: {
  detail: CoachProfileDetail;
  html: RenderedHtml;
  // Performance-review cycles for this member (fetched in the page, not in the
  // coaching data layer, so lib/reviews' server deps never reach this bundle).
  // The table is team's component, rendered by the route and passed as a node.
  reviewCount: number;
  reviewHistory: ReactNode;
  initialTab?: string;
  todayIso: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  // Which tabs this profile has earned (G.5). Derived before the initial tab is
  // chosen, because a deep link to a tab that is not offered has to fall back.
  // The Log holds every 1-1 that is not still to come, so that is what earns
  // the tab and what its count says; counting the upcoming booking too made
  // the tab promise a row it never shows (K.79).
  const loggedMeetings = detail.meetings.filter((m) => m.outcome !== "booked").length;
  const tabFacts: CoachTabFacts = {
    meetings: loggedMeetings,
    reviews: reviewCount,
    trends: detail.trends.length,
    checkins: detail.checkins.length,
  };
  const tabs = offeredCoachTabs(tabFacts);
  const [tab, setTab] = useState<CoachTab>(() => resolveCoachTab(initialTab, tabFacts));
  // The tab actually shown. A click can outlive its tab — archiving the last
  // 1-1 takes the Log away while the coach is standing on it — so the offered
  // list has the final say rather than stale state, and the pane is never
  // blank. Derived rather than an effect: there is nothing to synchronise.
  const active = tabs.includes(tab) ? tab : "next";

  // onOk runs only when the write landed: forms clear or close there, so a
  // refused save keeps what the coach typed (K.79). A thrown action (an
  // expired session, an AI step timing out) becomes a message rather than the
  // error page.
  const run = (label: string, fn: () => Promise<ActionResult>, onOk?: () => void) => {
    setError(null);
    startTransition(async () => {
      let res: ActionResult;
      try {
        res = await fn();
      } catch {
        res = { ok: false, error: "That did not go through. Try again." };
      }
      if (!res.ok) setError(`${label}: ${res.error}`);
      else onOk?.();
    });
  };

  // Tab lives in the URL (?tab=…) so links are shareable and refresh keeps the
  // place, without a server round-trip: the server reads the initial tab, and
  // switching only rewrites the query.
  const selectTab = (id: CoachTab) => {
    setTab(id);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (id === "next") url.searchParams.delete("tab");
      else url.searchParams.set("tab", id);
      window.history.replaceState(null, "", url.toString());
    }
  };

  // Everything this pair has said in past recaps, as one blob for the unasked
  // question to match against (L.12). The shared recap rather than the coach's
  // private half: a question is "covered" when the two of them talked about it.
  const saidBefore = detail.meetings
    .map((m) => m.sharedSummaryMarkdown ?? "")
    .join(" ");

  // Nothing between these two yet (L.13). Derived here as well as in the
  // header because both halves of the page answer the same question, and a
  // second derivation is cheaper than threading one through a server component
  // into a client one.
  const bare = profileIsBare({
    hasNextMeeting: detail.meetings.some((m) => m.status === "scheduled"),
    hasHeldMeeting: detail.meetings.some((m) => m.status === "held"),
    openCommitments: detail.commitments.filter((c) =>
      (OPEN_COMMITMENT_STATUSES as CommitmentStatus[]).includes(c.status),
    ).length,
    goals: detail.goals.length,
  });

  const counts: Partial<Record<CoachTab, number>> = {
    log: loggedMeetings,
    goals: detail.goals.filter((g) => g.status === "active").length,
    performance: reviewCount,
  };

  return (
    <div>
      <div className="coach-run-status" role="status" aria-live="polite">
        {error && <div className="admin-alert admin-alert--err">{error}</div>}
        {busy && <div className="admin-hint">Working… AI steps can take a minute.</div>}
      </div>

      <nav className="admin-tabs coach-tabs" role="tablist" aria-label="Coaching sections">
        {tabs.map((id) => {
          const isActive = active === id;
          const count = counts[id];
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`admin-tab${isActive ? " is-active" : ""}`}
              onClick={() => selectTab(id)}
            >
              {COACH_TAB_LABELS[id]}
              {typeof count === "number" && count > 0 && <span className="admin-coach-tab-count">{count}</span>}
            </button>
          );
        })}
      </nav>

      {/* Keyed by tab: a switch remounts the pane and plays the crossfade, the
          same way the member's page has since K.29 (G.4). The coach's side of
          the same product was switching with a hard cut. */}
      <div key={active} className="admin-coach-profile coach-pane">
        {active === "next" && (
          <>
            {/* The first visit is a different page, not an emptier one (L.13,
                mirroring K.27 on the member's side). Talking points and an
                empty Next 1-1 card tell a coach nothing they can act on when
                the two of them have never met. */}
            {bare ? (
              <FirstMeeting name={detail.member.name} profileId={detail.profileId} todayIso={todayIso} />
            ) : (
              <>
            <CarriedOverCard detail={detail} todayIso={todayIso} />
            {/* The session tab (K.80): the agenda beside what happened since
                last time, the session's own record folded below. */}
            <SessionView
              detail={detail}
              html={html}
              run={run}
              busy={busy}
              todayIso={todayIso}
              extra={
                <UnaskedQuestion
                  saidBefore={saidBefore}
                  busy={busy}
                  onAdd={(q) => run("Talking point", () => addTalkingPoint(detail.profileId, q))}
                />
              }
            />
              </>
            )}
          </>
        )}

        {active === "log" && <MeetingsCard detail={detail} html={html} run={run} busy={busy} view="log" todayIso={todayIso} />}

        {active === "goals" && (
          <>
            <GoalsCard detail={detail} run={run} busy={busy} />
            <PrioritiesCard detail={detail} run={run} busy={busy} />
            <CompanyGoalsCard detail={detail} />
          </>
        )}

        {active === "person" && (
          <>
            {/* The member's own account first, then the coach's read of them
                (L.3). This order is the argument: how they say they work is
                what a coach adapts to, and the OCEAN read is the coach's
                interpretation beside it rather than the headline above it. */}
            <TheirHowIWork facts={detail.howIWork} name={detail.member.name} />
            <NoticedCard detail={detail} run={run} busy={busy} />
            <OceanCard detail={detail} run={run} busy={busy} />
            <CraftCard detail={detail} />
            <NotesCard
              title="Private coaching notes"
              hint="How they're wired plus the retention read. Only you see this. It feeds the AI prep."
              initial={detail.privateProfileMarkdown ?? ""}
              rendered={html.privateProfile}
              onSave={(md, onOk) => run("Private notes", () => savePrivateProfile(detail.profileId, md), onOk)}
              busy={busy}
            />
            <CadenceCard detail={detail} run={run} busy={busy} />
          </>
        )}

        {active === "performance" && <PerformanceCard memberName={detail.member.name} reviewCount={reviewCount} history={reviewHistory} />}

        {active === "insights" && (
          <>
            <TrendsCard detail={detail} html={html} run={run} busy={busy} />
            <CheckinsCard detail={detail} html={html} />
          </>
        )}
      </div>
    </div>
  );
}

import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { PageHead } from "@/kernel/ui/PageHead";
import type { CoachRosterRow, RosterCandidate } from "@/entities/coaching/lib/data/roster";
import { rowState, type RowState } from "@/entities/coaching/lib/row-state";
import { sectionDay } from "@/entities/coaching/lib/roster-sections";
import { afterName, homeSummary, waitingItems, type HomeRow } from "@/entities/coaching/lib/home-lines";
import type { PracticeFacts } from "@/entities/coaching/lib/practice-facts";
import { practiceIsBare } from "@/entities/coaching/lib/practice-facts";
import { PracticeTiles } from "@/entities/coaching/ui/PracticeTiles";
import { PracticeDetail } from "@/entities/coaching/ui/PracticeDetail";
import { AddToRoster } from "@/entities/coaching/ui/AddToRoster";
import { buildWeekStrip } from "@/entities/coaching/lib/week-strip";
import { WeekStrip } from "@/entities/coaching/ui/WeekStrip";
import { PersonCard } from "@/entities/coaching/ui/PersonCard";

// The coach's home page (K.82): your people, as cards.
//
// The list it replaced was rows of sentences with a small face, and the CEO's
// verdict was that it was blank, that nothing said the face opened the person,
// and that his instinct was to call them instead. So the people are the page:
// a card each, whole-card clickable, carrying what a call would have told him.
// What waits on the coach is one sentence above the cards with a quiet marker
// on the card itself, never a second list of the same people. Cards are in
// session-date order, which is about time, never about the person; nothing
// here scores, ranks or colours anybody.
export function CoachRosterView({
  roster,
  candidates,
  practice,
  today,
  tabBar,
}: {
  roster: CoachRosterRow[];
  candidates: RosterCandidate[];
  // Four aggregates about the practice (K.54), with no person column by type.
  practice: PracticeFacts;
  today: string;
  // Current | Dotted Line | Past Team, drawn by the page under the heading.
  tabBar?: ReactNode;
}) {
  const homes = new Map(roster.map((r) => [r.profileId, homeRow(r)]));
  const ordered = [...roster].sort((a, b) => {
    const da = sectionDay((homes.get(a.profileId) as HomeRow).state) ?? "9999";
    const db = sectionDay((homes.get(b.profileId) as HomeRow).state) ?? "9999";
    return da.localeCompare(db) || a.member.name.localeCompare(b.member.name);
  });
  const orderedHomes = ordered.map((r) => homes.get(r.profileId) as HomeRow);
  const waiting = waitingItems(orderedHomes, today);
  const markerFor = (profileId: string) => {
    const item = waiting.find((w) => w.profileId === profileId);
    if (!item) return null;
    return item.text.startsWith("sent a check-in") ? "New check-in" : "Waiting on you";
  };

  return (
    <div className="coach-page">
      <PageHead
        title="Your people"
        sub={roster.length > 0 ? homeSummary(orderedHomes, today) : "Nobody on your roster yet"}
        action={<AddToRoster candidates={candidates} />}
      />

      {tabBar}

      {roster.length === 0 && (
        <p className="admin-empty coach-empty">
          The people you coach live here. Add someone, agree a first session with them, and this page shows you what
          each of them is working on.
        </p>
      )}

      {roster.length > 0 && (
        <WeekStrip
          days={buildWeekStrip(
            roster.map((r) => ({
              profileId: r.profileId,
              name: r.member.name,
              avatarUrl: r.member.avatarUrl,
              nextOneOnOneOn: r.nextOneOnOneOn,
              nextStartsAt: r.nextStartsAt,
              proposedOn: r.proposedOn,
              proposedBy: r.proposedBy,
              heldThisWeek: r.heldThisWeek,
            })),
            today,
          )}
        />
      )}

      {waiting.length > 0 && (
        <p className="coach-waiting">
          <b>Waiting on you:</b>{" "}
          {waiting.map((w, i) => (
            <Fragment key={w.profileId}>
              {i > 0 && " · "}
              <Link href={`/team/coaching/${w.profileId}`} className="coach-waiting-name">
                {w.first}
              </Link>
              {afterName(w)}
            </Fragment>
          ))}
        </p>
      )}

      {roster.length > 0 && (
        <div className="coach-pgrid">
          {ordered.map((r, i) => (
            <PersonCard
              key={r.profileId}
              row={r}
              home={homes.get(r.profileId) as HomeRow}
              marker={markerFor(r.profileId)}
              today={today}
              index={i}
            />
          ))}
        </div>
      )}

      {roster.length > 0 && !practiceIsBare(practice) && (
        <section className="coach-practice-foot" aria-label="Your coaching this month">
          <h2 className="coach-section-title">Your coaching this month</h2>
          <div className="coach-practice">
            <PracticeTiles facts={practice} />
            <PracticeDetail facts={practice} />
          </div>
        </section>
      )}
    </div>
  );
}

// The row's state and the facts the home lines read, built once per person
// so the card, the header and the waiting sentence agree (G.8).
function homeRow(r: CoachRosterRow): HomeRow {
  const state: RowState = rowState({
    proposedOn: r.proposedOn,
    proposedBy: r.proposedBy,
    nextOneOnOneOn: r.nextOneOnOneOn,
    agendaWritten: r.agendaWritten,
    missedOn: r.missedOn,
    missedMeetingId: r.missedMeetingId,
    everMet: r.heldCount > 0,
    suggestedOn: r.suggestedOn,
    leave: r.leave,
  });
  return {
    profileId: r.profileId,
    name: r.member.name,
    state,
    checkinWritten: r.signals.checkinWritten,
    lastHeldOn: r.lastHeldOn,
    lastHeldFormat: r.lastHeldFormat,
    nextStartsAt: r.nextStartsAt,
  };
}

"use client";

import { MyTalkingPoints } from "./MyTalkingPoints";
import type { LeaveSpan } from "@/entities/coaching/lib/leave-window";
import { NextOneOnOne, type NextMeeting } from "./NextOneOnOne";
import { PreferredSlot } from "./PreferredSlot";
import type { PreMeeting } from "@/entities/coaching/lib/types";
import type { Commitment } from "@/entities/coaching/lib/data/rows";
import type { TalkingPoint } from "@/entities/coaching/lib/data/profile";

// The Next 1-1 tab, lifted out of MyCoachingView so the view stays a map of
// the page rather than a list of every pane's props.
//
// It carries the `coach-prep` anchor (K.53), and where that anchor points
// depends on what the member can actually do: with a meeting booked, preparing
// means writing the agenda, and with no date yet it means proposing one. The
// next step's sentence says which, so the anchor lands on the thing the
// sentence asked for either way.
export function NextOneOnOnePane({
  next,
  coachName,
  preMeeting,
  commitments,
  recentNotes,
  movedCards,
  talkingPoints,
  preferredTime,
  proposedOn,
  missedOn,
  suggestedOn,
  hasMet,
  coachLeave,
  myLeave,
}: {
  next: NextMeeting | null;
  coachName: string | null;
  preMeeting: PreMeeting;
  commitments: Commitment[];
  recentNotes: string[];
  movedCards: string[];
  talkingPoints: TalkingPoint[];
  preferredTime: string | null;
  proposedOn: string | null;
  missedOn: string | null;
  suggestedOn: string | null;
  hasMet: boolean;
  coachLeave: LeaveSpan[];
  myLeave: LeaveSpan[];
}) {
  return (
    <>
      {next && (
        <div id="coach-prep" tabIndex={-1} className="coach-anchor">
          <NextOneOnOne
            next={next}
            coachName={coachName}
            preMeeting={preMeeting}
            commitments={commitments}
            recentNotes={recentNotes}
            movedCards={movedCards}
          />
        </div>
      )}
      <MyTalkingPoints talkingPoints={talkingPoints} />
      <div id={next ? undefined : "coach-prep"} tabIndex={next ? undefined : -1} className="coach-anchor">
        <PreferredSlot
          preferredTime={preferredTime}
          nextOn={next?.heldOn ?? null}
          coachName={coachName}
          proposedOn={proposedOn}
          missedOn={missedOn}
          suggestedOn={suggestedOn}
          hasMet={hasMet}
          coachLeave={coachLeave}
          myLeave={myLeave}
        />
      </div>
    </>
  );
}

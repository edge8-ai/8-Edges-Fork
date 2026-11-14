"use client";

import { MyOverview } from "./MyOverview";
import type { CoachingPriority, OceanProfile } from "@/entities/coaching/lib/data/goals";
import type { LadderRung } from "@/entities/coaching/lib/data/member-ladder";
import type { Commitment } from "@/entities/coaching/lib/data/rows";
import type { SinceLine } from "@/entities/coaching/lib/since-line";
import type { SharedGoal } from "@/entities/coaching/client";
import type { HowIWork } from "@/entities/coaching/lib/how-i-work";
import type { GrowthFacts } from "./growth-facts";

// The Today tab, lifted out of MyCoachingView for the same reason
// NextOneOnOnePane and MyHistoryPane were: the view is a map of the page, and
// a map that restates every pane's props is a list.
//
// It also unpacks the growth facts, so the view hands down one object and the
// pane decides which two numbers the Overview actually wants.
export function MyOverviewPane({
  growth,
  firstVisit,
  rungs,
  commitments,
  teamMemberId,
  priorities,
  ocean,
  coachName,
  since,
  sharedGoals,
  howIWork,
  onGoToGoals,
}: {
  growth: GrowthFacts;
  firstVisit: boolean;
  rungs: LadderRung[];
  commitments: Commitment[];
  teamMemberId: string;
  priorities: CoachingPriority[];
  ocean: OceanProfile | null;
  coachName: string | null;
  since: SinceLine | null;
  sharedGoals: SharedGoal[];
  howIWork: HowIWork;
  onGoToGoals: () => void;
}) {
  return (
    <MyOverview
      totalKept={growth.totalKept}
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
      onGoToGoals={onGoToGoals}
    />
  );
}

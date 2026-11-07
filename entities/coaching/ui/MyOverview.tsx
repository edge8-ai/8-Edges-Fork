"use client";

import type { CoachingPriority, OceanProfile } from "@/entities/coaching/lib/data/goals";
import type { LadderRung } from "@/entities/coaching/lib/data/member-ladder";
import type { Commitment } from "@/entities/coaching/lib/data/rows";
import { sampleLadderRungs } from "@/entities/coaching/lib/data/sample-ladder";
import { MyCommitments } from "./MyCommitments";
import { MyOcean } from "./MyOcean";
import { MyPriorities } from "./MyPriorities";
import { WhereIAmGoing } from "./WhereIAmGoing";
import { GrowthPlant } from "./GrowthPlant";
import { HowIWork } from "./HowIWork";
import type { HowIWork as HowIWorkFacts } from "@/entities/coaching/lib/how-i-work";
import type { SharedGoal } from "@/entities/coaching/client";
import { plantTitle } from "@/entities/coaching/lib/growth";
import { SinceLine } from "./SinceLine";
import type { SinceLine as SinceLineFacts } from "@/entities/coaching/lib/since-line";

// The Overview tab (K.16, spec 2.1, 2.2, 2.7): where I am going, then what I
// promised, then the context that used to live on the "My profile" tab.
//
// The first visit is a different page, not an emptier one (spec 2.7): a member
// with no goal and no 1-1 behind them sees one block, one button and a worked
// example of the ladder (K.27), because every other section would be an empty
// frame asking them to fill it.

export function MyOverview({
  totalKept,
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
  // Commitments kept over the whole history, for the plant (K.30).
  totalKept: number;
  firstVisit: boolean;
  rungs: LadderRung[];
  commitments: Commitment[];
  teamMemberId: string;
  priorities: CoachingPriority[];
  ocean: OceanProfile | null;
  coachName: string | null;
  // What has happened since the last held 1-1 (K.44); null before the first one.
  since: SinceLineFacts | null;
  // Other people lifting the same company key result (L.5).
  sharedGoals: SharedGoal[];
  // The member's own account of how they work (L.3).
  howIWork: HowIWorkFacts;
  onGoToGoals: () => void;
}) {
  if (firstVisit) {
    return (
      <>
        <section className="admin-card admin-coach-section">
          <div className="admin-card-title">Start with one goal</div>
          <p className="admin-hint">
            One goal, written by you, is what every 1-1 here is about. Say what you will move, by how much, and by when.
          </p>
          <p className="admin-hint">
            {coachName
              ? `${coachName} sees it as soon as you save it, and your next 1-1 starts from it.`
              : "You can set it now; it is yours to run, coach or no coach."}
          </p>
          <div className="admin-form-actions">
            <button type="button" className="admin-btn admin-btn--primary" onClick={onGoToGoals}>
              Write my FAST goal
            </button>
          </div>
        </section>

        {/* The worked example (K.27): the ask above is easier to answer next to a
            filled-in ladder than next to an empty page. */}
        <WhereIAmGoing rungs={sampleLadderRungs()} sample />
      </>
    );
  }

  return (
    <>
      {/* The story first, then the board it is about (K.44). */}
      <SinceLine line={since} />

      {/* The board is where a next step sends a member (K.53): it takes focus
          as well as the scroll, and the CSS gives it a scroll-margin. The card is
          one grid (K.50): a plant gutter down the left with the plant and its
          sentence at the top, sticky so a long board scrolls past them, and the
          columns to the right; on a phone the two sit in one strip above. */}
      <section id="coach-board" tabIndex={-1} className="admin-card admin-coach-section coach-anchor coach-board-card">
        <div className="coach-promised-head">
          <div className="admin-card-title">What I&apos;m working on</div>
          <div className="admin-hint">
            Your own cards, in your words. Drag one when it moves; kept ones grow the plant, and nothing here ever shrinks it.
          </div>
        </div>
        <div className="coach-board-gutter">
          <GrowthPlant totalKept={totalKept} />
          <p className="coach-board-foot">{plantTitle(totalKept)}</p>
        </div>
        {/* MyCommitments renders a fragment, so it needs a wrapper of its own to be
            one grid cell rather than three. */}
        <div className="coach-board-main">
          <MyCommitments commitments={commitments} teamMemberId={teamMemberId} coachName={coachName} />
        </div>
      </section>

      <div id="coach-goal" tabIndex={-1} className="coach-anchor">
        <WhereIAmGoing rungs={rungs} sharedGoals={sharedGoals} onAddTarget={onGoToGoals} />
      </div>

      <MyPriorities priorities={priorities} coachName={coachName} />

      {/* The two halves of the same conversation, side by side and equal (L.3):
          how the member says they work, and how their coach reads them. Each
          card's eyebrow names its author, which is the whole difference between
          a conversation and a verdict. */}
      <div className="coach-two-up">
        <HowIWork facts={howIWork} coachName={coachName} />
        <MyOcean ocean={ocean} coachName={coachName} />
      </div>
    </>
  );
}

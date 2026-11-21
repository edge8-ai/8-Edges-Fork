import type { PersonalRecords, RingState, Unlocks } from "@/entities/coaching/lib/growth";
import type { NextStep } from "@/entities/coaching/lib/next-step";

// The K.30 growth facts, as the page passes them around.
//
// Its own file because three components take it and it belonged to none of
// them: it used to live inside MyCoachingView, which meant the Overview pane
// imported a type from the view that renders it. A shared prop type sitting
// inside one of its own consumers is a circle waiting to be drawn.
export type GrowthFacts = {
  ring: RingState;
  totalKept: number;
  unlocks: Unlocks;
  records: PersonalRecords;
  // The one thing to do now (K.40), decided on the server from the same facts.
  nextStep: NextStep;
};

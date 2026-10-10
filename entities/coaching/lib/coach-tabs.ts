// Which of the coach profile's tabs are worth offering (G.5).
//
// The page used to render all six whatever the profile held, so a coach opening
// somebody they had never met was offered a 1-1 Log, a Performance tab and an
// Insights tab that could not contain anything — four dead tabs above a card
// whose whole message is "nothing is missing here". /team/my-coaching has held
// the opposite rule since K.30: History is not offered until the first 1-1 is
// held, and appears the moment it is.
//
// Three tabs are always offered, because each is somewhere the coach can WRITE
// rather than only read:
//
//   next    the agenda, and on a bare profile the block that books the first 1-1
//   goals   a goal can be drafted before the two have ever met
//   person  private notes, the OCEAN read and the cadence are the coach's own
//
// The other three are reports on things that have happened, so they are offered
// once something has. This is the no-empty-tab rule, not a permission rule:
// nothing here decides what a coach may see, only what is worth a tab.

export const COACH_TAB_IDS = ["next", "log", "goals", "person", "performance", "insights"] as const;

export type CoachTabId = (typeof COACH_TAB_IDS)[number];

/** The facts a tab is offered on. Counts, never rows — this decides visibility. */
export type CoachTabFacts = {
  meetings: number;
  reviews: number;
  trends: number;
  checkins: number;
};

const ALWAYS: readonly CoachTabId[] = ["next", "goals", "person"];

/** True when this tab can hold something for this profile. */
export function coachTabIsOffered(id: CoachTabId, facts: CoachTabFacts): boolean {
  if (ALWAYS.includes(id)) return true;
  if (id === "log") return facts.meetings > 0;
  if (id === "performance") return facts.reviews > 0;
  // Insights holds the trend report and the mid-cycle check-ins; either alone
  // earns the tab, and the trend card explains its own "needs 2 summarized
  // 1-1s" floor once you are in there.
  return facts.trends > 0 || facts.checkins > 0;
}

/** The offered tabs, in the page's fixed order. */
export function offeredCoachTabs(facts: CoachTabFacts): CoachTabId[] {
  return COACH_TAB_IDS.filter((id) => coachTabIsOffered(id, facts));
}

/**
 * The tab to open on. A deep link to a tab this profile does not offer — a
 * bookmarked ?tab=insights from before the trends were archived, say — lands on
 * Next 1-1 rather than on a bar with nothing selected.
 */
export function resolveCoachTab(raw: string | undefined, facts: CoachTabFacts): CoachTabId {
  const wanted = COACH_TAB_IDS.find((id) => id === raw);
  return wanted && coachTabIsOffered(wanted, facts) ? wanted : "next";
}

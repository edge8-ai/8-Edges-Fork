// "What to do now" (K.40): the one thing the page suggests when it opens,
// worked out from the member's own state. A suggestion, never a to-do list
// and never a count of what is overdue: the page says one useful thing and
// where it lives, so nobody has to work out what the page is for.

// Where on that tab the button lands. A tab id alone was not enough: half the
// suggestions point at the tab the member is already on, so the click changed
// nothing (K.53). The anchor names the section the sentence is about, and the
// view scrolls it into view and focuses it.
export type NextStepAnchor = "board" | "goal" | "prep" | "history";

export type NextStep = {
  title: string;
  body: string;
  tab: "overview" | "my" | "goals" | "history";
  anchor: NextStepAnchor;
  // The strip's "What I'm on" cell drops its "· n blocked" clause when this
  // sentence already says it: one fact, one place, rather than the same fact
  // twice in two devices a screen apart (critique §A.12).
  covers?: "blocked";
  cta: string;
};

export function nextStep(input: {
  activeGoals: number;
  hasNextDate: boolean;
  formOpen: boolean;
  answered: boolean;
  blocked: number;
  onIt: number;
  heldMeetings: number;
}): NextStep {
  if (input.activeGoals === 0) {
    return {
      title: "Start with one goal",
      body: "One sentence about what you will move this quarter. Everything else on this page grows from it.",
      tab: "goals",
      anchor: "goal",
      cta: "Write my goal",
    };
  }
  if (input.formOpen && !input.answered) {
    return {
      title: "Your 1-1 is close: ninety seconds",
      body: "Three optional lines set the agenda in your words. Your coach walks in knowing what moved and what is stuck.",
      tab: "my",
      anchor: "prep",
      cta: "Set the agenda",
    };
  }
  if (input.blocked > 0) {
    return {
      title: `${input.blocked === 1 ? "One card is" : `${input.blocked} cards are`} blocked`,
      body: "A line on why is enough. Ask now sends it to your coach today instead of at the next 1-1.",
      tab: "overview",
      anchor: "board",
      covers: "blocked",
      cta: "Show me the card",
    };
  }
  // Only before a first 1-1. Between 1-1s nothing booked is the normal state
  // (ADR-0010) and booking is the coach's move, so a member who has met their
  // coach is not told to pick a day for a "first" 1-1 on every visit.
  if (!input.hasNextDate && input.heldMeetings === 0) {
    return {
      title: "Pick a day for your first 1-1",
      body: "Propose a weekday that suits you; your coach confirms it in one click.",
      tab: "my",
      anchor: "prep",
      cta: "Pick a day",
    };
  }
  if (input.onIt > 0) {
    return {
      title: "Move a card when it moves",
      body: "Drag it by the grip or use its menu. Kept cards close the ring and grow the plant. Got news on your goal? Bump the number where it lives.",
      tab: "overview",
      anchor: "board",
      cta: "See the board",
    };
  }
  return {
    title: input.heldMeetings > 0 ? "Nothing waiting on you" : "You are set up",
    body: "Add a commitment when you make one, or read back what you have kept so far.",
    tab: input.heldMeetings > 0 ? "history" : "overview",
    anchor: input.heldMeetings > 0 ? "history" : "board",
    cta: input.heldMeetings > 0 ? "Read my history" : "See the board",
  };
}

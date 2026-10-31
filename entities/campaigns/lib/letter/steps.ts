// The letter agent's process, in order. Each step must run and pass its check
// before the next starts; the pipeline decides the order and refuses to skip.
// `agent_step` on email_campaigns holds the id of the step to run next.
//
// After the six writing steps the run asks for its approval (decision Y.54:
// the letter waits for an approval before it mails the list) and parks at
// `ready` on a letter_send approval. Approving it schedules the send: the run
// moves to `scheduled`, with the due time in the broadcast's scheduled_at, and
// the first agent-driver tick after that time releases the letter to the send
// routine, unless the approval was cancelled first (Y.17).

// Where each step is recorded as a routine run (Settings -> Agents). Here
// rather than in ./run-step so the approval module can name the run's waiting
// rows without importing the run loop that imports it.
export const LETTER_ROUTINE_ID = "/api/cron/letter-agent/";

export const LETTER_STEPS = [
  { id: "gather", label: "Gather" },
  { id: "pick", label: "Pick posts" },
  { id: "write", label: "Write" },
  { id: "rotate", label: "Rotate" },
  { id: "assemble", label: "Assemble" },
  { id: "validate", label: "Validate" },
  { id: "ask", label: "Ask approval" },
] as const;

export type LetterStepId = (typeof LETTER_STEPS)[number]["id"];

// ready: waits on the letter_send approval; nothing runs.
// scheduled: approved, waits for its due time; the driver runs the send then.
// released: handed to the send routine, which mails each person at their moment.
// rejected, cancelled: the approver said no, or someone cancelled; nothing sent.
export const LETTER_READY = "ready" as const;
export const LETTER_SCHEDULED = "scheduled" as const;
export const LETTER_RELEASED = "released" as const;
export const LETTER_REJECTED = "rejected" as const;
export const LETTER_CANCELLED = "cancelled" as const;
export type LetterState =
  | LetterStepId
  | typeof LETTER_READY
  | typeof LETTER_SCHEDULED
  | typeof LETTER_RELEASED
  | typeof LETTER_REJECTED
  | typeof LETTER_CANCELLED;

/** What the tick driver runs: a writing step, or the send once it is due. */
export type LetterDrivenStep = LetterStepId | typeof LETTER_SCHEDULED;

export function isLetterStep(value: string | null | undefined): value is LetterStepId {
  return LETTER_STEPS.some((s) => s.id === value);
}

export function letterStepIndex(id: LetterStepId): number {
  return LETTER_STEPS.findIndex((s) => s.id === id);
}

export function nextLetterState(id: LetterStepId): LetterState {
  const i = letterStepIndex(id);
  return i + 1 < LETTER_STEPS.length ? LETTER_STEPS[i + 1].id : LETTER_READY;
}

const STATE_LABELS: Record<Exclude<LetterState, LetterStepId>, string> = {
  ready: "Ready for approval",
  scheduled: "Approved, waiting for its send time",
  released: "Released to the send",
  rejected: "Rejected",
  cancelled: "Cancelled before it sent",
};

export function describeLetterState(state: LetterState): string {
  if (!isLetterStep(state)) return STATE_LABELS[state];
  return `Step ${letterStepIndex(state) + 1} of ${LETTER_STEPS.length}: ${LETTER_STEPS[letterStepIndex(state)].label}`;
}

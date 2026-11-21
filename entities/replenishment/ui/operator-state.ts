// What the scanner remembers while a run is worked (RP.5; the approved
// Operator board): the job on screen, which jobs are finished and with which
// BIN, what is typed in each job's BIN field, and whether a finished round is
// being looked back over. Pure, so every move an operator makes is tested
// without a browser; OperatorCard only dispatches.
//
// It starts from the stored jobs and changes ahead of the server: a scan moves
// on at once, and a refusal puts the job back as it was and shows why. The
// jobs table holds the progress; nothing here is kept in browser storage.

export type OperatorState = {
  /** The index of the job on screen. */
  at: number;
  /** Every finished job's id, with the BIN it was finished with. */
  done: Record<string, string>;
  /** What is in each job's BIN field, kept per job so Previous and Next lose nothing typed. */
  drafts: Record<string, string>;
  /** Back over a finished round, so the finish screen stays out of the way. */
  review: boolean;
  /** One sentence for the operator: a refusal, or a nudge to scan first. */
  notice: string | null;
};

export type OperatorAction =
  | { type: "type"; value: string }
  | { type: "complete"; bin: string }
  | { type: "reopen" }
  | { type: "prev" }
  | { type: "next" }
  | { type: "review" }
  | { type: "notice"; notice: string | null }
  /** Puts a job back as it was before a change the server refused, and shows it with the reason. */
  | { type: "restore"; jobId: string; bin: string | null; notice: string };

/** The first open job, or the first job when every one is done. */
export function initialState(jobs: readonly { id: string; binUsed: string | null; doneAt: string | null }[]): OperatorState {
  const done: Record<string, string> = {};
  for (const job of jobs) if (job.doneAt && job.binUsed !== null) done[job.id] = job.binUsed;
  const open = jobs.findIndex((job) => !(job.id in done));
  return { at: open < 0 ? 0 : open, done, drafts: { ...done }, review: false, notice: null };
}

/** The next open job after `from`, wrapping round to the start; -1 when every job is done. */
function nextOpen(ids: readonly string[], from: number, done: Record<string, string>): number {
  for (let k = 1; k <= ids.length; k++) {
    const i = (from + k) % ids.length;
    if (!(ids[i] in done)) return i;
  }
  return -1;
}

const without = (map: Record<string, string>, key: string) => {
  const rest = { ...map };
  delete rest[key];
  return rest;
};

/** The reducer for one run's jobs, in walking order. */
export function operatorReducer(ids: readonly string[]) {
  return (state: OperatorState, action: OperatorAction): OperatorState => {
    const id = ids[state.at];
    if (id === undefined) return state;
    switch (action.type) {
      case "type":
        return { ...state, drafts: { ...state.drafts, [id]: action.value }, notice: null };
      case "complete": {
        // Finishing a job goes on to the next open one, so the operator keeps
        // moving; with none left the finish screen shows.
        const done = { ...state.done, [id]: action.bin };
        const next = nextOpen(ids, state.at, done);
        return { at: next < 0 ? state.at : next, done, drafts: { ...state.drafts, [id]: action.bin }, review: false, notice: null };
      }
      case "reopen":
        // The BIN stays in the field, so a mis-scan is corrected by scanning again.
        return { ...state, done: without(state.done, id), notice: null };
      case "prev":
        return { ...state, at: Math.max(0, state.at - 1), notice: null };
      case "next":
        return { ...state, at: Math.min(ids.length - 1, state.at + 1), notice: null };
      case "review":
        return { ...state, at: 0, review: true, notice: null };
      case "notice":
        return { ...state, notice: action.notice };
      case "restore": {
        const at = ids.indexOf(action.jobId);
        if (at < 0) return state;
        const done = action.bin === null ? without(state.done, action.jobId) : { ...state.done, [action.jobId]: action.bin };
        // Shown again, so the operator sees which job did not save.
        return { ...state, at, done, review: true, notice: action.notice };
      }
    }
  };
}

/**
 * The BIN a key press finishes the job with: Enter with something in the
 * field, trimmed. A keyboard-wedge scanner types the code and sends Enter, so
 * no timing guess is needed to tell a scan from typing.
 */
export function scannedBin(key: string, value: string): string | null {
  if (key !== "Enter") return null;
  const bin = value.trim();
  return bin === "" ? null : bin;
}

/** What the top bar and the screen choice read from the state. */
export function overview(state: OperatorState, total: number) {
  const doneCount = Object.keys(state.done).length;
  return {
    total,
    doneCount,
    empty: total === 0,
    finished: total > 0 && doneCount >= total && !state.review,
    counter: total === 0 ? "0 / 0" : `${state.at + 1} / ${total}`,
  };
}

/** A move offered as a choice at the shelf ("8 or 12"): the engine joins the options with " or ". */
export const isChoice = (move: string) => move.includes(" or ");

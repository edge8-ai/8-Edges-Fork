import { readRoutineSwitch } from "./routine-config";
import { currentRunMode } from "./run-context";

// The mode a chain opens a run in (A.43). A tick-driven chain (ADR 0015) reads
// its routine's switch on Settings -> Agents when it opens a run, and the run
// keeps that mode. Four chains each wrote that read themselves, and the copies
// disagreed on the one case the switch cannot answer: a routine nobody has
// switched yet. The proposal and inquiry chains open shadow runs then, so they
// cannot go live by being deployed; the hiring chain and the meeting follow-up
// open live runs, as the kernel reads a missing row. Each answer was right for
// its chain, and each was implicit in whichever copy you were reading. Here
// the rule is written once and the answers become declarations: a chain names
// its policy beside its definition, and this module applies it.
//
// What is not a policy, because every chain agrees: a paused switch opens
// nothing ("off"), a shadow switch opens shadow, a live switch opens live, and
// a chain opening a run inside a shadow run opens it in shadow, so a shadow
// tick never starts work that would act on the world.
//
// This is the mode a run opens in, kept on the run's own row. The mode each
// step runs in is a separate read, made before the step claims its tick
// (run-mode.ts, readRoutineMode), where a missing row is live for every routine.

export type OpeningMode = "live" | "shadow" | "off";

export type OpeningPolicy = {
  /** What a routine with no switch row opens in. */
  noRow: OpeningMode;
  /** What a switch that cannot be read opens in, or "throw" to raise the read's error. */
  unread: OpeningMode | "throw";
  /**
   * The longest the read may take, and what to open in past it. For a caller
   * someone is waiting on (the contact form's response), where a slow read
   * must take the path without the chain rather than hold them.
   */
  deadline?: { ms: number; then: OpeningMode };
};

type Read = Awaited<ReturnType<typeof readRoutineSwitch>> | { timedOut: true };

async function readWithin(routineId: string, deadline: OpeningPolicy["deadline"]): Promise<Read> {
  if (!deadline) return readRoutineSwitch(routineId);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<{ timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), deadline.ms);
  });
  return Promise.race([readRoutineSwitch(routineId), timedOut]).finally(() => clearTimeout(timer));
}

/**
 * The mode a new run of `routineId` opens in, by the chain's declared policy.
 * The switch is read first, so Off wins even inside a shadow run: a chain that
 * is switched off opens nothing in any mode.
 */
export async function chainOpeningMode(routineId: string, policy: OpeningPolicy): Promise<OpeningMode> {
  const read = await readWithin(routineId, policy.deadline);
  if ("timedOut" in read) {
    console.error(`[chain-opening] ${routineId}: the switch took longer than ${policy.deadline?.ms} ms; opening ${policy.deadline?.then}`);
    return policy.deadline?.then ?? "off";
  }
  if (!read.ok) {
    if (policy.unread === "throw") throw new Error(`${routineId}: the switch could not be read: ${read.error}`);
    console.error(`[chain-opening] ${routineId}: the switch could not be read; opening ${policy.unread}: ${read.error}`);
    return policy.unread;
  }
  if (read.row?.mode === "paused") return "off";
  if (currentRunMode() === "shadow") return "shadow";
  return read.row ? read.row.mode : policy.noRow;
}

import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { initialState as scannerInitial, operatorReducer, overview as scannerOverview, scannedBin as scannerScannedBin, type OperatorAction, type OperatorState } from "../ui/operator-state";
import { OFFLINE_LOGIC } from "./offline-script";

// The offline copy's script (RP.7), run as the downloaded file runs it: the
// source text, evaluated in a V8 context of its own with no DOM and no
// storage. Each test plays moves through it and, where the scanner has the
// same move, through the scanner's reducer too, so the two cannot drift.
type Job = { id: string; bin: string | null };
type Saved = { v: number; at: number; done: Record<string, string> };
type Logic = {
  initialState: (jobs: Job[]) => OperatorState;
  reduce: (ids: string[], state: OperatorState, action: OperatorAction) => OperatorState;
  scannedBin: (key: string, value: string) => string | null;
  overview: (state: OperatorState, total: number) => ReturnType<typeof scannerOverview>;
  resume: (jobs: Job[], saved: unknown) => OperatorState;
  progressStore: (storage: () => Storage, runId: string) => { works: () => boolean; load: () => Saved | null; save: (state: OperatorState) => boolean };
};

const logic = runInNewContext(`${OFFLINE_LOGIC}\n;({ initialState, reduce, scannedBin, overview, resume, progressStore })`, {}) as Logic;
// Values made in the other context carry its prototypes; a JSON round trip compares them as plain data.
const plain = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const JOBS: Job[] = [
  { id: "j1", bin: null },
  { id: "j2", bin: "P02-01" },
  { id: "j3", bin: null },
];
const IDS = JOBS.map((j) => j.id);
const STORED = JOBS.map((j) => ({ id: j.id, binUsed: j.bin, doneAt: j.bin === null ? null : "2026-10-29T02:00:00Z" }));

/** Plays the moves through both reducers and answers both trails of states. */
function play(moves: OperatorAction[]) {
  const scanner = operatorReducer(IDS);
  let a = scannerInitial(STORED);
  let b = logic.initialState(JOBS);
  const trail: [OperatorState, OperatorState][] = [[a, plain(b)]];
  for (const move of moves) {
    a = scanner(a, move);
    b = logic.reduce(IDS, b, move);
    trail.push([a, plain(b)]);
  }
  return trail;
}

describe("the offline script works a round the way the scanner does", () => {
  it("starts on the first open job, a job finished in the App counted as done", () => {
    expect(plain(logic.initialState(JOBS))).toEqual(scannerInitial(STORED));
    expect(plain(logic.initialState(JOBS))).toMatchObject({ at: 0, done: { j2: "P02-01" } });
  });

  it("matches the scanner move for move through a whole round, a reopen and a look back", () => {
    const trail = play([
      { type: "type", value: "P01" },
      { type: "complete", bin: "P01-01" },
      { type: "prev" },
      { type: "reopen" },
      { type: "notice", notice: "Scan or type the BIN first." },
      { type: "type", value: "P01-09" },
      { type: "complete", bin: "P01-09" },
      { type: "complete", bin: "P03-03" },
      { type: "review" },
      { type: "next" },
      { type: "next" },
      { type: "next" },
    ]);
    for (const [scanner, offline] of trail) expect(offline).toEqual(scanner);
    const [, last] = trail[trail.length - 1];
    // j1 kept its first scan; j2, finished in the App, was reopened and scanned again.
    expect(last.done).toEqual({ j1: "P01-01", j2: "P01-09", j3: "P03-03" });
  });

  it("finishes the round when the last job is done, and shows the jobs again on review", () => {
    let state = logic.initialState(JOBS);
    state = logic.reduce(IDS, state, { type: "complete", bin: "A" });
    expect(plain(logic.overview(state, 3))).toMatchObject({ doneCount: 2, finished: false, counter: "3 / 3" });
    state = logic.reduce(IDS, state, { type: "complete", bin: "B" });
    expect(plain(logic.overview(state, 3))).toEqual(scannerOverview(state, 3));
    expect(logic.overview(state, 3).finished).toBe(true);
    state = logic.reduce(IDS, state, { type: "review" });
    expect(plain(logic.overview(state, 3))).toMatchObject({ finished: false, counter: "1 / 3" });
  });

  it("finishes a job on Enter with something scanned, trimmed, and on nothing else", () => {
    for (const [key, value] of [["Enter", "  P01-01 \n"], ["Enter", "   "], ["Tab", "P01-01"], ["a", ""]] as const) {
      expect(logic.scannedBin(key, value)).toBe(scannerScannedBin(key, value));
    }
    expect(logic.scannedBin("Enter", "  P01-01 ")).toBe("P01-01");
  });

  it("calls an empty run empty", () => {
    expect(plain(logic.overview(logic.initialState([]), 0))).toEqual({ total: 0, doneCount: 0, empty: true, finished: false, counter: "0 / 0" });
  });
});

describe("progress kept on the device", () => {
  /** An in-memory stand-in for localStorage; `blocked` throws the way a refused storage does. */
  function memory(blocked = false) {
    const items = new Map<string, string>();
    const store = {
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => void items.set(k, v),
      removeItem: (k: string) => void items.delete(k),
    } as unknown as Storage;
    return {
      items,
      storage: () => {
        if (blocked) throw new Error("SecurityError: storage is blocked");
        return store;
      },
    };
  }

  it("saves each move under the run's id and resumes from it", () => {
    const device = memory();
    const store = logic.progressStore(device.storage, "run-1");
    expect(store.works()).toBe(true);
    const state = logic.reduce(IDS, logic.initialState(JOBS), { type: "complete", bin: "P01-01" });
    expect(store.save(state)).toBe(true);
    expect([...device.items.keys()]).toEqual(["replenishment-offline:run-1"]);
    const resumed = logic.resume(JOBS, store.load());
    expect(plain(resumed)).toEqual({ at: 2, done: { j1: "P01-01", j2: "P02-01" }, drafts: { j1: "P01-01", j2: "P02-01" }, review: false, notice: null });
  });

  it("keeps a reopen of a job finished in the App: saved progress replaces the starting point", () => {
    const saved: Saved = { v: 1, at: 1, done: { j1: "P01-01" } };
    expect(plain(logic.resume(JOBS, saved))).toMatchObject({ at: 1, done: { j1: "P01-01" } });
  });

  it("ignores saved progress for jobs this run does not have, and a position past its end", () => {
    const saved = { v: 1, at: 9, done: { gone: "X", j3: "P03-03", j1: 7 } };
    expect(plain(logic.resume(JOBS, saved))).toMatchObject({ at: 0, done: { j3: "P03-03" } });
    expect(plain(logic.resume(JOBS, "not json at all"))).toEqual(plain(logic.initialState(JOBS)));
    expect(plain(logic.resume(JOBS, null))).toEqual(plain(logic.initialState(JOBS)));
  });

  it("treats blocked storage as no saved progress, never as a failure", () => {
    const store = logic.progressStore(memory(true).storage, "run-1");
    expect(store.works()).toBe(false);
    expect(store.load()).toBeNull();
    expect(store.save(logic.initialState(JOBS))).toBe(false);
  });

  it("treats a damaged saved copy as no saved progress", () => {
    const device = memory();
    device.items.set("replenishment-offline:run-1", "{not json");
    expect(logic.progressStore(device.storage, "run-1").load()).toBeNull();
  });
});

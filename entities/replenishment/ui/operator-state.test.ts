import { describe, expect, it } from "vitest";
import { JOBS, done } from "./__fixtures__/scanner";
import { initialState, isChoice, operatorReducer, overview, scannedBin, type OperatorAction, type OperatorState } from "./operator-state";

// Every move an operator makes on the scanner (RP.5; spec "On the scanner"),
// through the state the card keeps: where a round starts, what a scan does,
// Previous and Next, Reopen, the finish screen, and a refusal put back.
const ids = JOBS.map((j) => j.id);
const reduce = operatorReducer(ids);
const run = (state: OperatorState, ...actions: OperatorAction[]) => actions.reduce(reduce, state);
const fresh = () => initialState(JOBS);

describe("where a round starts", () => {
  it("opens on the first job when nothing is done", () => {
    expect(fresh()).toEqual({ at: 0, done: {}, drafts: {}, review: false, notice: null });
  });

  it("opens on the first open job, carrying the finished ones and their BINs from the table", () => {
    const state = initialState([done(JOBS[0], "P03-02"), JOBS[1], JOBS[2]]);
    expect(state.at).toBe(1);
    expect(state.done).toEqual({ j1: "P03-02" });
    // The BIN used shows in the field of a finished job.
    expect(state.drafts).toEqual({ j1: "P03-02" });
  });

  it("opens on the finish screen when every job was finished before", () => {
    const state = initialState(JOBS.map((j) => done(j, `B-${j.id}`)));
    expect(state.at).toBe(0);
    expect(overview(state, JOBS.length).finished).toBe(true);
  });
});

describe("a scan", () => {
  it("finishes the job on Enter with something in the field, trimmed", () => {
    expect(scannedBin("Enter", "  P03-02 \t")).toBe("P03-02");
  });

  it("does nothing on Enter with an empty field, or on any other key", () => {
    expect(scannedBin("Enter", "")).toBeNull();
    expect(scannedBin("Enter", "   ")).toBeNull();
    expect(scannedBin("Tab", "P03-02")).toBeNull();
    expect(scannedBin("a", "P03-02")).toBeNull();
  });

  it("records the BIN and moves on to the next open job", () => {
    const state = run(fresh(), { type: "type", value: "P03-02" }, { type: "complete", bin: "P03-02" });
    expect(state.done).toEqual({ j1: "P03-02" });
    expect(state.at).toBe(1);
  });

  it("skips jobs already finished, wrapping round to an open one before this", () => {
    const state = run(initialState([JOBS[0], done(JOBS[1], "X"), JOBS[2]]), { type: "next" }, { type: "next" }, { type: "complete", bin: "Z" });
    // j3 done; j2 was done already; the open one left is j1, back at the start.
    expect(state.at).toBe(0);
    expect(overview(state, 3).doneCount).toBe(2);
  });

  it("overwrites the BIN of a finished job scanned again", () => {
    const state = run(initialState([done(JOBS[0], "P03-02"), JOBS[1], JOBS[2]]), { type: "prev" }, { type: "complete", bin: "P04-01" });
    expect(state.done.j1).toBe("P04-01");
  });

  it("keeps what is typed in each job's field across Previous and Next", () => {
    const state = run(fresh(), { type: "type", value: "P0" }, { type: "next" }, { type: "type", value: "Q9" }, { type: "prev" });
    expect(state.at).toBe(0);
    expect(state.drafts).toEqual({ j1: "P0", j2: "Q9" });
  });
});

describe("Previous and Next", () => {
  it("move one job at a time and stop at either end", () => {
    let state = fresh();
    state = run(state, { type: "prev" });
    expect(state.at).toBe(0);
    state = run(state, { type: "next" }, { type: "next" }, { type: "next" });
    expect(state.at).toBe(2);
    state = run(state, { type: "prev" });
    expect(state.at).toBe(1);
  });

  it("clear the last notice", () => {
    expect(run(fresh(), { type: "notice", notice: "Scan or type the BIN first." }, { type: "next" }).notice).toBeNull();
  });
});

describe("Reopen", () => {
  it("opens a finished job again and keeps its BIN in the field to scan over", () => {
    const start = initialState([done(JOBS[0], "P03-02"), JOBS[1], JOBS[2]]);
    const state = run(start, { type: "prev" }, { type: "reopen" });
    expect(state.done).toEqual({});
    expect(state.drafts.j1).toBe("P03-02");
    expect(state.at).toBe(0);
  });
});

describe("the finish screen", () => {
  it("shows once the last job is finished, and stays out of the way while the round is looked back over", () => {
    let state = run(fresh(), { type: "complete", bin: "A" }, { type: "complete", bin: "B" });
    expect(overview(state, 3).finished).toBe(false);
    state = run(state, { type: "complete", bin: "C" });
    expect(overview(state, 3)).toMatchObject({ finished: true, doneCount: 3 });
    expect(state.done).toEqual({ j1: "A", j2: "B", j3: "C" });

    state = run(state, { type: "review" });
    expect(overview(state, 3).finished).toBe(false);
    expect(state.at).toBe(0);
    // A scan over a finished job while looking back finishes the round again.
    state = run(state, { type: "complete", bin: "A2" });
    expect(overview(state, 3).finished).toBe(true);
  });

  it("is never shown for an empty run, which says there is nothing to do instead", () => {
    const view = overview(initialState([]), 0);
    expect(view).toMatchObject({ empty: true, finished: false, counter: "0 / 0" });
  });
});

describe("a change the server refused", () => {
  it("puts a scanned job back as open, shows it again, and says why", () => {
    const state = run(fresh(), { type: "complete", bin: "P03-02" }, { type: "restore", jobId: "j1", bin: null, notice: "Could not save the job. Try again." });
    expect(state.done).toEqual({});
    expect(state.at).toBe(0);
    expect(state.notice).toBe("Could not save the job. Try again.");
    // What was scanned stays in the field, so the operator only has to try again.
    expect(state.drafts.j1).toBe("P03-02");
  });

  it("puts a reopened job back as finished with its BIN", () => {
    const start = initialState([done(JOBS[0], "P03-02"), JOBS[1], JOBS[2]]);
    const state = run(start, { type: "prev" }, { type: "reopen" }, { type: "restore", jobId: "j1", bin: "P03-02", notice: "This run is closed, so its jobs can't change." });
    expect(state.done).toEqual({ j1: "P03-02" });
  });
});

describe("the counter", () => {
  it("counts the job on screen, from one", () => {
    expect(overview(run(fresh(), { type: "next" }), 3).counter).toBe("2 / 3");
  });
});

it("tells a move chosen at the shelf from a set one", () => {
  expect(isChoice("8 or 12")).toBe(true);
  expect(isChoice("12")).toBe(false);
});

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JOBS, WORDS, done } from "./__fixtures__/scanner";
import type { Profile } from "../lib/profile";
import { OperatorScreen, type ScreenHandlers } from "./OperatorScreen";
import { initialState, operatorReducer, type OperatorAction, type OperatorState } from "./operator-state";
import type { StoredJob } from "../lib/run-store";

// What the operator sees on the scanner (RP.5; the approved Operator board),
// drawn at each moment of a round. The repo has no DOM test environment and no
// @testing-library/react, so the screen is rendered as the server renders it,
// from a state the reducer produced; operator-state.test.ts walks the moves
// between those moments and OperatorCard.test.tsx the calls they make.
const noop = () => {};
const on: ScreenHandlers = { type: noop, key: () => false, markDone: noop, reopen: noop, prev: noop, next: noop, review: noop, openHelp: noop, closeHelp: noop, toggleTheme: noop };
const notYou = async () => {};
const RUN = { title: "Run 29 Oct · Main floor", truncated: false, dataRows: 4210 };
const PERSON = { name: "Rowan Quill", initials: "RQ", day: "Thu 29 Oct" };

function draw(jobs: StoredJob[], opts: { actions?: OperatorAction[]; truncated?: boolean; helpOpen?: boolean; theme?: "light" | "dark" | null; words?: Profile["words"] } = {}) {
  const reduce = operatorReducer(jobs.map((j) => j.id));
  const state: OperatorState = (opts.actions ?? []).reduce(reduce, initialState(jobs));
  return renderToStaticMarkup(
    <OperatorScreen
      run={{ ...RUN, truncated: opts.truncated ?? false }}
      person={PERSON}
      words={opts.words ?? WORDS}
      jobs={jobs}
      state={state}
      theme={opts.theme ?? null}
      helpOpen={opts.helpOpen ?? false}
      on={on}
      notYou={notYou}
    />,
  );
}
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("a job on the scanner", () => {
  it("shows the item code and description in full, the three figures in the profile's words, and the move", () => {
    const t = text(draw(JOBS));
    expect(t).toContain("KES-38");
    expect(t).toContain("Kestrel Arlo Black KES-38");
    expect(t).toContain("Kestrel · Sizes 36-42");
    expect(t).toMatch(/Pick face 4 Reserve 15 Move 12/);
    expect(t).not.toContain("The box decides.");
  });

  it("lists every reserve location in walking order, the first marked as the place to start", () => {
    const html = draw(JOBS);
    expect(text(html)).toMatch(/Collect from, in this order U01 Start here 10 U05 5/);
    expect(html.match(/Start here/g)).toHaveLength(1);
  });

  it("labels the suggested BINs Destination 1 to 3, under the profile's rule", () => {
    expect(text(draw(JOBS))).toMatch(/Replenish to Start with Destination 1\. Destination 1 P03-02 Destination 2 P04-01 Destination 3 P07-03/);
  });

  it("shows the reason for the choice when the move is one", () => {
    const t = text(draw(JOBS, { actions: [{ type: "next" }] }));
    expect(t).toContain("8 or 10");
    expect(t).toContain("The box decides.");
  });

  it("shows the profile's note instead of destinations when the item has no pick BIN yet", () => {
    const t = text(draw(JOBS, { actions: [{ type: "next" }, { type: "next" }] }));
    expect(t).toContain("No pick BIN yet. Use any BIN in the size zone.");
    expect(t).not.toContain("Destination 1");
  });

  it("has a BIN field for the scan, and says any BIN is accepted", () => {
    const html = draw(JOBS);
    expect(html).toContain('placeholder="Scan or type the BIN"');
    expect(html).toContain('autoComplete="off"');
    expect(text(html)).toContain("A scan finishes the job on its own. Any BIN is accepted.");
  });

  it("offers Mark done on an open job, and Reopen with a Done badge on a finished one", () => {
    expect(text(draw(JOBS))).toContain("Mark done");
    expect(text(draw(JOBS))).not.toContain("Reopen");
    const finished = draw([done(JOBS[0], "P03-02"), JOBS[1], JOBS[2]], { actions: [{ type: "prev" }] });
    expect(text(finished)).toContain("Reopen");
    expect(text(finished)).not.toContain("Mark done");
    expect(finished).toContain('class="rp-scan-done"');
    // The BIN it was finished with is in the field, to scan over.
    expect(finished).toContain('value="P03-02"');
  });

  it("stops Previous on the first job and Next on the last", () => {
    expect(draw(JOBS)).toMatch(/<button type="button" class="rp-scan-btn" disabled="">Previous/);
    const last = draw(JOBS, { actions: [{ type: "next" }, { type: "next" }] });
    expect(last).toMatch(/<button type="button" class="rp-scan-btn" disabled="">Next/);
    expect(last).not.toMatch(/disabled="">Previous/);
  });

  it("counts the job on screen and the jobs done", () => {
    const html = draw([done(JOBS[0], "A"), JOBS[1], JOBS[2]]);
    expect(html).toContain(">2 / 3</span>");
    expect(html).toContain('max="3" value="1"');
    expect(html).toContain('aria-label="1 of 3 jobs done"');
  });

  it("shows a refusal under the field", () => {
    const html = draw(JOBS, { actions: [{ type: "complete", bin: "P03-02" }, { type: "restore", jobId: "j1", bin: null, notice: "This run is closed, so its jobs can't change." }] });
    expect(html).toContain('role="alert"');
    expect(text(html)).toContain("This run is closed, so its jobs can't change.");
  });
});

describe("the truncation warning", () => {
  it("is on every job when the export may be cut off", () => {
    for (const actions of [[], [{ type: "next" } as const], [{ type: "next" } as const, { type: "next" } as const]]) {
      expect(text(draw(JOBS, { truncated: true, actions }))).toContain("Only 4,210 rows were read: this export may have been cut off. Check with the warehouse manager before working from it.");
    }
  });

  it("is not there when the export was read whole", () => {
    expect(text(draw(JOBS))).not.toContain("cut off");
  });
});

describe("an empty run", () => {
  it("says No replenishment required, with no job controls", () => {
    const t = text(draw([]));
    expect(t).toContain("No replenishment required");
    expect(t).not.toContain("Mark done");
    expect(t).not.toContain("Previous");
    expect(t).toContain("0 / 0");
  });
});

describe("the finish screen", () => {
  it("lists every BIN used once all jobs are done, and offers the way back to the jobs", () => {
    const html = draw(JOBS, { actions: [{ type: "complete", bin: "P03-02" }, { type: "complete", bin: "P05-01" }, { type: "complete", bin: "A-9" }] });
    const t = text(html);
    expect(t).toContain("Round complete");
    expect(t).toContain("All 3 jobs done. Saved to this run, so the warehouse manager sees each BIN you used.");
    expect(t).toMatch(/KES-38 P03-02 KES-44 P05-01 KES-46 A-9/);
    expect(t).toContain("Back to the jobs");
    expect(t).not.toContain("Mark done");
  });

  it("goes back to the first job when the round is looked back over", () => {
    const t = text(draw(JOBS, { actions: [{ type: "complete", bin: "A" }, { type: "complete", bin: "B" }, { type: "complete", bin: "C" }, { type: "review" }] }));
    expect(t).not.toContain("Round complete");
    expect(t).toContain("KES-38");
    expect(t).toContain("Reopen");
  });
});

describe("around the job", () => {
  it("names who is signed in, with Not you? as a sign-out form", () => {
    const html = draw(JOBS);
    expect(text(html)).toContain("Rowan Quill · Thu 29 Oct");
    expect(html).toMatch(/<form[^>]*>.*Not you\?<\/button><\/form>/);
  });

  it("opens the instructions from the profile's words", () => {
    const html = draw(JOBS, { helpOpen: true });
    expect(html).toContain('role="dialog"');
    expect(text(html)).toMatch(/Instructions Work the jobs in order\. Scan the BIN you used\. Got it/);
    expect(draw(JOBS)).not.toContain('role="dialog"');
  });

  it("follows the device's theme until one is chosen", () => {
    expect(draw(JOBS)).not.toContain("data-theme");
    expect(draw(JOBS, { theme: "dark" })).toContain('data-theme="dark"');
  });

  it("shows the profile's footer line, or none", () => {
    expect(text(draw(JOBS))).toContain("Rules set by the warehouse manager");
    expect(draw(JOBS, { words: { ...WORDS, footer: null } })).not.toContain("rp-scan-footer");
  });
});

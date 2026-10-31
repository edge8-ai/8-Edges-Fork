"use client";

// The scanner's one client component (RP.5; spec "Surfaces"): it holds the
// scan input and the job on screen, and calls the job actions. A scan (the
// wedge types the BIN and sends Enter) or Mark done finishes the job and moves
// on at once; when the server refuses, the job is put back and shows why. The
// jobs table holds the progress, so a locked scanner or a closed tab loses
// nothing but what was typed and not yet sent.
//
// Light or dark and "instructions read" are this device's own, read after the
// first paint, so the server's markup and the browser's agree on hydration.
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Result } from "@/kernel/data/result";
import type { Profile } from "../lib/profile";
import type { StoredJob } from "../lib/run-store";
import { devicePrefs, type Theme } from "./device-prefs";
import { initialState, operatorReducer, overview, scannedBin } from "./operator-state";
import { OperatorScreen, type ScannerPerson, type ScannerRun } from "./OperatorScreen";

export type OperatorActions = {
  completeJob: (jobId: string, bin: string) => Promise<Result>;
  reopenJob: (jobId: string) => Promise<Result>;
  notYou: () => Promise<void>;
};

type Props = {
  run: ScannerRun;
  person: ScannerPerson;
  words: Profile["words"];
  jobs: StoredJob[];
  actions: OperatorActions;
};

/** An action that threw (no signal, a server error) answers like one that refused. */
async function settle(pending: Promise<Result>, fallback: string): Promise<Result> {
  try {
    return await pending;
  } catch {
    return { ok: false, error: fallback };
  }
}

export function OperatorCard({ run, person, words, jobs, actions }: Props) {
  const reducer = useMemo(() => operatorReducer(jobs.map((job) => job.id)), [jobs]);
  const [state, dispatch] = useReducer(reducer, jobs, initialState);
  const [theme, setTheme] = useState<Theme | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const prefs = useMemo(() => devicePrefs(() => window.localStorage), []);

  // After the first paint: this device's theme, and the instructions the first
  // time it is used (every time, when its storage is blocked).
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setTheme(prefs.theme());
      if (!prefs.instructionsSeen()) setHelpOpen(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [prefs]);

  const job = jobs[state.at];
  const jobDone = job ? job.id in state.done : false;
  const { finished } = overview(state, jobs.length);

  // The BIN field holds the focus whenever a job is on screen, with its text
  // selected, so the next scan replaces what is there without a touch.
  useEffect(() => {
    if (helpOpen || finished) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [state.at, jobDone, helpOpen, finished]);

  const complete = async (bin: string) => {
    if (!job) return;
    const before = state.done[job.id] ?? null;
    dispatch({ type: "complete", bin });
    const result = await settle(actions.completeJob(job.id, bin), "Could not save the job. Check the signal and try again.");
    if (!result.ok) dispatch({ type: "restore", jobId: job.id, bin: before, notice: result.error });
  };

  const reopen = async () => {
    if (!job || !jobDone) return;
    const before = state.done[job.id];
    dispatch({ type: "reopen" });
    const result = await settle(actions.reopenJob(job.id), "Could not reopen the job. Check the signal and try again.");
    if (!result.ok) dispatch({ type: "restore", jobId: job.id, bin: before, notice: result.error });
  };

  return (
    <OperatorScreen
      run={run}
      person={person}
      words={words}
      jobs={jobs}
      state={state}
      theme={theme}
      helpOpen={helpOpen}
      notYou={actions.notYou}
      inputRef={inputRef}
      on={{
        type: (value) => dispatch({ type: "type", value }),
        key: (key, value) => {
          const bin = scannedBin(key, value);
          if (bin === null) return false;
          void complete(bin);
          return true;
        },
        markDone: () => {
          const bin = job ? (state.drafts[job.id] ?? "").trim() : "";
          if (bin === "") {
            dispatch({ type: "notice", notice: "Scan or type the BIN first." });
            inputRef.current?.focus();
            return;
          }
          void complete(bin);
        },
        reopen: () => void reopen(),
        prev: () => dispatch({ type: "prev" }),
        next: () => dispatch({ type: "next" }),
        review: () => dispatch({ type: "review" }),
        openHelp: () => setHelpOpen(true),
        closeHelp: () => {
          setHelpOpen(false);
          prefs.markInstructionsSeen();
        },
        toggleTheme: () => {
          const shown = theme ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
          const next: Theme = shown === "dark" ? "light" : "dark";
          setTheme(next);
          prefs.setTheme(next);
        },
      }}
    />
  );
}

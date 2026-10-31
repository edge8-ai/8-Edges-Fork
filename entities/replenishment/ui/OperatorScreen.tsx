// The scanner's screen (RP.5; the approved Operator board), drawn from the
// state OperatorCard keeps: a fixed top bar with the instructions, the theme
// switch, the counter and the progress; the one job, which alone scrolls; and
// the foot controls. Also the empty run, the finish screen, the truncation
// warning on every job and the instructions sheet.
//
// It holds no state of its own, so a test draws any moment of a round by
// handing it a state; app/styles/replenishment-scanner.css paints it.
import type { Ref } from "react";
import type { Profile } from "../lib/profile";
import type { StoredJob } from "../lib/run-store";
import type { Theme } from "./device-prefs";
import { isChoice, overview, type OperatorState } from "./operator-state";

export type ScannerRun = { title: string; truncated: boolean; dataRows: number };
export type ScannerPerson = { name: string; initials: string; day: string };

export type ScreenHandlers = {
  type: (value: string) => void;
  key: (key: string, value: string) => boolean;
  markDone: () => void;
  reopen: () => void;
  prev: () => void;
  next: () => void;
  review: () => void;
  openHelp: () => void;
  closeHelp: () => void;
  toggleTheme: () => void;
};

type Props = {
  run: ScannerRun;
  person: ScannerPerson;
  words: Profile["words"];
  jobs: readonly StoredJob[];
  state: OperatorState;
  theme: Theme | null;
  helpOpen: boolean;
  on: ScreenHandlers;
  /** "Not you?": a form action, so it signs out even before the page is interactive. */
  notYou: () => Promise<void>;
  inputRef?: Ref<HTMLInputElement>;
};

const HelpIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
    <path d="M12 17h.01" />
  </svg>
);

const MoonIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);

const TickIcon = (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const rows = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "row" : "rows"}`;

export function OperatorScreen({ run, person, words, jobs, state, theme, helpOpen, on, notYou, inputRef }: Props) {
  const view = overview(state, jobs.length);
  const job = jobs[state.at];
  const working = !view.empty && !view.finished && job !== undefined;

  return (
    <div className="rp-scan" data-theme={theme ?? undefined}>
      <header className="rp-scan-top">
        <div className="rp-scan-bar">
          <button type="button" className="rp-scan-icon" aria-label="Instructions" onClick={on.openHelp}>
            {HelpIcon}
          </button>
          <div className="rp-scan-title">
            <div className="rp-scan-name">Replenishment</div>
            <div className="rp-scan-sub">{run.title}</div>
          </div>
          <button type="button" className="rp-scan-icon" aria-label="Switch light or dark" onClick={on.toggleTheme}>
            {MoonIcon}
          </button>
          <span className="rp-scan-counter" aria-label={view.empty ? "No jobs" : `Job ${state.at + 1} of ${view.total}`}>
            {view.counter}
          </span>
        </div>
        <progress className="rp-scan-progress" max={Math.max(view.total, 1)} value={view.doneCount} aria-label={`${view.doneCount} of ${view.total} jobs done`} />
        <div className="rp-scan-person">
          <span className="rp-scan-avatar" aria-hidden="true">
            {person.initials}
          </span>
          <span className="rp-scan-who">
            {person.name} · {person.day}
          </span>
          <form action={notYou}>
            <button type="submit" className="rp-scan-link">
              Not you?
            </button>
          </form>
        </div>
      </header>

      <main className="rp-scan-main">
        {run.truncated && (
          <p className="rp-scan-warn">
            Only {rows(run.dataRows)} were read: this export may have been cut off. Check with the warehouse manager before working from it.
          </p>
        )}
        {view.empty ? (
          <section className="rp-scan-card rp-scan-centre">
            <h1 className="rp-scan-big">No replenishment required</h1>
            <p className="rp-scan-muted">Nothing in this run is below its level with stock in {words.reserve}.</p>
          </section>
        ) : view.finished ? (
          <section className="rp-scan-card rp-scan-centre">
            <span className="rp-scan-tick">{TickIcon}</span>
            <h1 className="rp-scan-big">Round complete</h1>
            <p className="rp-scan-muted">
              {view.total === 1 ? "The job is done." : `All ${view.total} jobs done.`} Saved to this run, so the warehouse manager sees each BIN you used.
            </p>
            <ul className="rp-scan-rows rp-scan-summary">
              {jobs.map((j) => (
                <li key={j.id} className="rp-scan-row">
                  <span className="rp-scan-grow">{j.item}</span>
                  <strong>{state.done[j.id]}</strong>
                </li>
              ))}
            </ul>
            <button type="button" className="rp-scan-btn" onClick={on.review}>
              Back to the jobs
            </button>
          </section>
        ) : job ? (
          <JobCard job={job} words={words} state={state} on={on} inputRef={inputRef} />
        ) : null}
      </main>

      <footer className="rp-scan-foot">
        {working && (
          <div className="rp-scan-controls">
            <button type="button" className="rp-scan-btn" onClick={on.prev} disabled={state.at === 0}>
              Previous
            </button>
            {job.id in state.done ? (
              <button type="button" className="rp-scan-btn rp-scan-btn--wide" onClick={on.reopen}>
                Reopen
              </button>
            ) : (
              <button type="button" className="rp-scan-btn rp-scan-btn--wide rp-scan-btn--primary" onClick={on.markDone}>
                Mark done
              </button>
            )}
            <button type="button" className="rp-scan-btn" onClick={on.next} disabled={state.at === view.total - 1}>
              Next
            </button>
          </div>
        )}
        {words.footer && <p className="rp-scan-footer">{words.footer}</p>}
      </footer>

      {helpOpen && (
        <div className="rp-scan-overlay">
          <button type="button" className="rp-scan-scrim" aria-label="Close the instructions" onClick={on.closeHelp} />
          <div className="rp-scan-sheet" role="dialog" aria-modal="true" aria-labelledby="rp-scan-help-title">
            <h2 id="rp-scan-help-title" className="rp-scan-big">
              Instructions
            </h2>
            <ul className="rp-scan-steps">
              {words.instructions.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <button type="button" className="rp-scan-btn rp-scan-btn--primary rp-scan-btn--full" onClick={on.closeHelp} autoFocus>
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function JobCard({ job, words, state, on, inputRef }: { job: StoredJob; words: Profile["words"]; state: OperatorState; on: ScreenHandlers; inputRef?: Ref<HTMLInputElement> }) {
  const done = job.id in state.done;
  return (
    <article className="rp-scan-card" aria-labelledby="rp-scan-item">
      <div className="rp-scan-head">
        <h1 id="rp-scan-item" className="rp-scan-item">
          {job.item}
        </h1>
        {done && <span className="rp-scan-done">Done</span>}
      </div>
      <p className="rp-scan-desc">{job.description}</p>
      <span className="rp-scan-chip">
        {job.rule} · {job.band}
      </span>

      <dl className="rp-scan-figures">
        <div className="rp-scan-figure">
          <dt>{words.pick}</dt>
          <dd>{job.pick}</dd>
        </div>
        <div className="rp-scan-figure">
          <dt>{words.reserve}</dt>
          <dd className="rp-scan-accent">{job.reserve}</dd>
        </div>
        <div className="rp-scan-figure rp-scan-figure--move">
          <dt>Move</dt>
          <dd>{job.move}</dd>
        </div>
      </dl>
      {isChoice(job.move) && <p className="rp-scan-hint">{words.choiceHint}</p>}

      <h2 className="rp-scan-label">Collect from, in this order</h2>
      <ol className="rp-scan-rows">
        {job.collect.map((row, k) => (
          <li key={`${row.location}-${k}`} className={k === 0 ? "rp-scan-row rp-scan-row--start" : "rp-scan-row"}>
            <span className="rp-scan-grow rp-scan-strong">{row.location}</span>
            {k === 0 && <span className="rp-scan-start">Start here</span>}
            <span className="rp-scan-qty">{row.qty}</span>
          </li>
        ))}
      </ol>

      <h2 className="rp-scan-label">Replenish to</h2>
      {job.destinations.length > 0 ? (
        <>
          <p className="rp-scan-rule">{words.destinationRule}</p>
          <ol className="rp-scan-rows">
            {job.destinations.map((bin, k) => (
              <li key={bin} className="rp-scan-row">
                <span className="rp-scan-grow rp-scan-muted">Destination {k + 1}</span>
                <span className="rp-scan-strong">{bin}</span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="rp-scan-nopick">{words.noPickNote}</p>
      )}

      <label className="rp-scan-field">
        <span className="rp-scan-label">BIN replenished</span>
        <input
          ref={inputRef}
          className="rp-scan-input"
          type="text"
          value={state.drafts[job.id] ?? ""}
          onChange={(e) => on.type(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (on.key(e.key, e.currentTarget.value)) e.preventDefault();
          }}
          placeholder="Scan or type the BIN"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="done"
          aria-describedby="rp-scan-bin-help"
        />
      </label>
      <p id="rp-scan-bin-help" className="rp-scan-muted rp-scan-small">
        A scan finishes the job on its own. Any BIN is accepted.
      </p>
      {state.notice && (
        <p className="rp-scan-notice" role="alert">
          {state.notice}
        </p>
      )}
    </article>
  );
}

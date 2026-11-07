// The offline copy of a run (RP.7; spec "Offline download"): one HTML file
// that opens from disk on a scanner with no signal and works the run's jobs
// the way the scanner does. A fallback, not the main path: its progress stays
// in that browser and is never sent back, and the file says so at the top.
//
// Built from the stored job rows and the run's profile snapshot, the same rows
// the scanner reads, never by running the engine again. Everything from the
// export (item codes, descriptions, locations) is untrusted text, so every
// value is HTML-escaped where it is drawn, and the jobs the script reads are
// embedded as JSON with `<`, `>` and `&` escaped, so no description can close
// the script element. The file loads nothing: style and script are inline,
// there is no font, image or link, and its own content policy refuses any
// request a browser might still try.
import { BUSINESS_TIME_ZONE } from "@/kernel/config/dates";
import type { Profile } from "./profile";
import type { StoredJob } from "./run-store";
import { OFFLINE_LOGIC, OFFLINE_UI } from "./offline-script";
import { OFFLINE_CSS } from "./offline-style";

export type OfflineRun = {
  id: string;
  /** What the top bar names the run by: "Run 29 Oct · Main floor". */
  title: string;
  uploadedAt: string;
  truncated: boolean;
  dataRows: number;
};

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Text safe inside an element or a quoted attribute. */
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** JSON safe inside a script element: nothing in it can end the element or open a comment. */
const scriptJson = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

/** "Replenishment_Report_2026-10-29.html": the run's upload day in the business time zone. */
export function offlineFileName(uploadedAt: string): string {
  const day = new Date(uploadedAt).toLocaleDateString("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: BUSINESS_TIME_ZONE });
  return `Replenishment_Report_${day}.html`;
}

/** A move offered as a choice at the shelf ("8 or 12"): the engine joins the options with " or ". */
const isChoice = (move: string) => move.includes(" or ");

const rows = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "row" : "rows"}`;

function jobCard(job: StoredJob, words: Profile["words"]): string {
  const e = escapeHtml;
  const collect = job.collect
    .map(
      (row, k) =>
        `<li class="rp-scan-row${k === 0 ? " rp-scan-row--start" : ""}"><span class="rp-scan-grow rp-scan-strong">${e(row.location)}</span>` +
        `${k === 0 ? '<span class="rp-scan-start">Start here</span>' : ""}<span class="rp-scan-qty">${e(row.qty)}</span></li>`,
    )
    .join("");
  const destinations =
    job.destinations.length > 0
      ? `<p class="rp-scan-rule">${e(words.destinationRule)}</p><ol class="rp-scan-rows">${job.destinations
          .map((bin, k) => `<li class="rp-scan-row"><span class="rp-scan-grow rp-scan-muted">Destination ${k + 1}</span><span class="rp-scan-strong">${e(bin)}</span></li>`)
          .join("")}</ol>`
      : `<p class="rp-scan-nopick">${e(words.noPickNote)}</p>`;
  return `<article class="rp-scan-card rp-scan-job" data-job="${e(job.id)}">
<div class="rp-scan-head"><h1 class="rp-scan-item">${e(job.item)}</h1><span class="rp-scan-done" hidden>Done</span></div>
<p class="rp-scan-desc">${e(job.description)}</p>
<span class="rp-scan-chip">${e(job.rule)} · ${e(job.band)}</span>
<dl class="rp-scan-figures"><div class="rp-scan-figure"><dt>${e(words.pick)}</dt><dd>${e(job.pick)}</dd></div><div class="rp-scan-figure"><dt>${e(words.reserve)}</dt><dd class="rp-scan-accent">${e(job.reserve)}</dd></div><div class="rp-scan-figure rp-scan-figure--move"><dt>Move</dt><dd>${e(job.move)}</dd></div></dl>
${isChoice(job.move) ? `<p class="rp-scan-hint">${e(words.choiceHint)}</p>` : ""}
<h2 class="rp-scan-label">Collect from, in this order</h2><ol class="rp-scan-rows">${collect}</ol>
<h2 class="rp-scan-label">Replenish to</h2>${destinations}
<label class="rp-scan-field"><span class="rp-scan-label">BIN replenished</span><input class="rp-scan-input" type="text" placeholder="Scan or type the BIN" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="done"></label>
<p class="rp-scan-muted rp-scan-small">A scan finishes the job on its own. Any BIN is accepted.</p>
</article>`;
}

/**
 * The whole offline file for one run. `jobs` in walking order, as jobsOfRun
 * reads them: a job already finished in the App starts finished here too.
 */
export function renderOfflineReport(run: OfflineRun, jobs: readonly StoredJob[], words: Profile["words"]): string {
  const e = escapeHtml;
  const data = { runId: run.id, jobs: jobs.map((job) => ({ id: job.id, item: job.item, bin: job.doneAt ? job.binUsed : null })) };
  const total = jobs.length;
  const body =
    total === 0
      ? `<section class="rp-scan-card rp-scan-centre"><h1 class="rp-scan-big">No replenishment required</h1><p class="rp-scan-muted">Nothing in this run is below its level with stock in ${e(words.reserve)}.</p></section>`
      : `${jobs.map((job) => jobCard(job, words)).join("\n")}
<section class="rp-scan-card rp-scan-centre rp-scan-finish" hidden><span class="rp-scan-tick" aria-hidden="true">✓</span><h1 class="rp-scan-big">Round complete</h1>
<p class="rp-scan-muted">${total === 1 ? "The job is done." : `All ${total} jobs done.`} Kept on this device only: tell the warehouse manager, or finish the run in the App, so the BINs you used are recorded.</p>
<ul class="rp-scan-rows rp-scan-summary">${jobs.map((job) => `<li class="rp-scan-row"><span class="rp-scan-grow">${e(job.item)}</span><strong data-bin-of="${e(job.id)}"></strong></li>`).join("")}</ul>
<button type="button" class="rp-scan-btn" data-do="review">Back to the jobs</button></section>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<title>Replenishment · ${e(run.title)}</title>
<style>${OFFLINE_CSS}</style>
<script>document.documentElement.className = 'rp-js';</script>
</head>
<body>
<div class="rp-scan">
<header class="rp-scan-top">
<div class="rp-scan-bar"><button type="button" class="rp-scan-icon" aria-label="Instructions" data-do="help">?</button><div class="rp-scan-title"><div class="rp-scan-name">Replenishment</div><div class="rp-scan-sub">${e(run.title)}</div></div><span class="rp-scan-counter">${total === 0 ? "0 / 0" : `1 / ${total}`}</span></div>
<progress class="rp-scan-progress" max="${Math.max(total, 1)}" value="0"></progress>
<p class="rp-scan-offline"><strong>Offline copy.</strong> Progress in this file stays on this device and is NOT sent back to the App.</p>
</header>
<main class="rp-scan-main">
${run.truncated ? `<p class="rp-scan-warn">Only ${rows(run.dataRows)} were read: this export may have been cut off. Check with the warehouse manager before working from it.</p>` : ""}
<p class="rp-scan-warn rp-scan-nostore" hidden>This browser is not keeping progress, so closing the page loses it.</p>
${body}
<p class="rp-scan-notice" role="alert" hidden></p>
</main>
<footer class="rp-scan-foot">
<div class="rp-scan-controls"${total === 0 ? " hidden" : ""}><button type="button" class="rp-scan-btn" data-do="prev">Previous</button><button type="button" class="rp-scan-btn rp-scan-btn--wide rp-scan-btn--primary" data-do="mark">Mark done</button><button type="button" class="rp-scan-btn" data-do="next">Next</button></div>
${words.footer ? `<p class="rp-scan-footer">${e(words.footer)}</p>` : ""}
</footer>
<div class="rp-scan-overlay" hidden><button type="button" class="rp-scan-scrim" aria-label="Close the instructions" data-do="close-help"></button>
<div class="rp-scan-sheet" role="dialog" aria-modal="true" aria-label="Instructions"><h2 class="rp-scan-big">Instructions</h2>
<ul class="rp-scan-steps">${words.instructions.map((line) => `<li>${e(line)}</li>`).join("")}</ul>
<button type="button" class="rp-scan-btn rp-scan-btn--primary rp-scan-btn--full" data-do="close-help">Got it</button></div></div>
</div>
<script type="application/json" data-rp="jobs">${scriptJson(data)}</script>
<script>${OFFLINE_LOGIC}${OFFLINE_UI}</script>
</body>
</html>
`;
}

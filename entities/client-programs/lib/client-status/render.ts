import { escapeHtml } from "@/kernel/config/html";
import { SECTION_HEADINGS, STATUS_SECTIONS, type StatusFacts } from "./facts";
import type { StatusNarrative } from "./draft";

// The weekly status page, rendered from a fixed template (Z.12, spec §3 draft).
// The model writes the narrative, the summary and the four lists of lines; the
// board and roadmap sections come from the facts alone and are never written by
// the model or edited by a person. Every word is escaped, the page carries no
// link, no image and no inline style, and its classes are the review page's own
// (app/admin/admin.css, `admin-status-*`).
//
// Since Z.12.1 this page reaches a client only when the account owner shares
// it themselves; nothing here publishes it. The draft's version hashes this
// HTML (with the company, week and title), so an edit saved over a version the
// owner did not see is refused rather than lost.

export const PLAIN_SUMMARY = "This week's page shows the board and the roadmap. No written summary this week.";

const SUMMARY_OPEN = '<p class="admin-status-summary">';
const SUMMARY = /<p class="admin-status-summary">([\s\S]*?)<\/p>/;

function section(heading: string, body: string): string {
  return `<section class="admin-status-section"><h3 class="admin-status-heading">${escapeHtml(heading)}</h3>${body}</section>`;
}

/** The page's HTML for one week: the narrative when there is one, the plain report when not. */
export function renderStatusPage(facts: StatusFacts, narrative: StatusNarrative | null): string {
  const parts: string[] = [`${SUMMARY_OPEN}${escapeHtml(narrative ? narrative.summary.trim() : PLAIN_SUMMARY)}</p>`];
  if (narrative) {
    for (const key of STATUS_SECTIONS) {
      const lines = narrative[key].map((l) => l.line.trim()).filter(Boolean);
      if (lines.length === 0) continue;
      parts.push(section(SECTION_HEADINGS[key], `<ul class="admin-status-lines">${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`));
    }
  }
  const lanes = facts.lanes
    .map((l) => `<div class="admin-status-lane"><span class="admin-status-lane-count">${l.count}</span><span class="admin-status-lane-name">${escapeHtml(l.name)}</span></div>`)
    .join("");
  parts.push(section("On the board", lanes ? `<div class="admin-status-lanes">${lanes}</div>` : '<p class="admin-status-note">No active board.</p>'));
  const { shipped, total } = facts.roadmap;
  parts.push(
    section(
      "Roadmap",
      total > 0
        ? `<progress class="admin-status-progress" max="${total}" value="${shipped}"></progress><p class="admin-status-note">${shipped} of ${total} roadmap items shipped</p>`
        : '<p class="admin-status-note">No roadmap items yet.</p>',
    ),
  );
  return `<div class="admin-status-doc">${parts.join("")}</div>`;
}

function unescapeHtml(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|#39);/g, (_m, e: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[e] as string);
}

/** The summary a page carries, as plain text: what the account owner edits. */
export function summaryOf(bodyHtml: string): string {
  const m = SUMMARY.exec(bodyHtml);
  return m ? unescapeHtml(m[1]) : "";
}

/** The page with its summary replaced: the one part a person may edit (spec decision 9). */
export function withSummary(bodyHtml: string, summary: string): string {
  return bodyHtml.replace(SUMMARY, () => `${SUMMARY_OPEN}${escapeHtml(summary.trim())}</p>`);
}

/** The page's words, as a reader sees them: what the check reads. */
export function visibleText(bodyHtml: string): string {
  return unescapeHtml(bodyHtml.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

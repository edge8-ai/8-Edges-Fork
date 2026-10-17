/**
 * What a chip on a card SAYS, as opposed to what the thing is called (W.103.2).
 *
 * Measured on the real board at 1728×1000 on 2026-09-22: a card's chip row is
 * 285px wide, chip widths ran 51px at the median and 244px at the ninetieth
 * percentile, and every one of the wide ones was a sprint name —
 * "Sprint 3 - Clean Routines, Client Rollouts" at 244px on 218 cards,
 * "Sprint 3 - Support, Discussion, Student Analytics" at 290px, which is wider
 * than the row that holds it. One such chip takes the whole line, so the chips
 * after it wrap: 38% of cards spent three rows on chips and 44% carried the
 * "+N" alone on a line of its own.
 *
 * The layout was never wrong. `max-width: 100%` on a chip is a sensible
 * overflow guard, and it quietly became "take the entire row" the first time
 * something put a sentence in a label. So the fix is here rather than in the
 * CSS: a chip shows a LABEL, and the name it stands for is one hover away and
 * in the drawer.
 */

/**
 * A sprint's name, cut to the part that identifies it.
 *
 * Sprint names in company_os are written as an identifier and a theme joined
 * by a dash — "Sprint 3 - Clean Routines, Client Rollouts", "Y26 Sprint 37",
 * "Sprint 4 — Workboard Views And Planning" — and it is the identifier that
 * tells two sprints apart on a card. The theme is what the sprint is FOR,
 * which is a thing to read on the sprint page, not on forty cards at once.
 *
 * Every dash that separates words is handled, because the board's own sprints
 * use two of them already: the ASCII hyphen and the em dash. A name with no
 * separator (`Y26 Sprint 37`) is returned whole — it is already a label.
 */
export function shortSprintName(name: string): string {
  const cut = name.search(/\s+[-–—:]\s+/);
  const head = (cut === -1 ? name : name.slice(0, cut)).trim();
  // A name whose separator comes first ("- Sprint 3") would leave nothing to
  // read, and a chip with no text is worse than a long one.
  return head.length > 0 ? head : name.trim();
}

// What this entity contributes to the Admin shell's navigation (ADR 0002).
// The shell owns the information architecture (kernel/shell/admin-ia.ts) and
// names the slots; this file names the rows that belong in them. Drop the entity
// from a deployment and these rows go with it.
import type { NavContribution } from "@/kernel/shell/nav";

// Every way of looking at the Edges Workboard, as one run of rows (W.92.1).
//
// They used to be two places at once: a pill tab strip on the page (Board,
// Flow, Sprint planning, Domains) and a view switcher in the toolbar (Board,
// List, Calendar, Timeline, Schedule). Neither was complete, so finding one
// of them meant knowing it was in the toolbar and not in the strip, and the
// strip spent a
// band of the page restating where you already were. The sidebar is where a
// person looks for "what else is there", so the whole set lives here and the
// strip is gone. The toolbar switcher stays: it is the fast flick between two
// views of the board you are already reading, a different act from navigating.
//
// The first five are the same page — `?view=` params rather than routes of
// their own (W.69: a route under app/ moves the hardcoded mount totals and
// makes the PR conflict with every other route-adding PR) — and the codec
// leaves a param out when it is at its default, so Board carries no query and
// is current exactly when the address bar is silent about the view.
// `makeIsActive` in kernel/shell/nav.ts is what reads that.
//
// The order is the order the toolbar switcher uses, which is the order in
// workboard-surface.ts: the admin surface offers all three. Calendar and
// Timeline had rows here until W.97.5 removed both views, and the Schedule had
// one until W.109 replaced it with the Calendar; an old bookmark to any of the
// three still opens, because the codec falls back to the board.
export const adminNav: NavContribution[] = [
  { section: "Operating System", group: "Edges", order: 20, items: [
    { label: "Board", href: "/admin/edges/workboard", ico: "▤", enabled: true },  // every open card, every board (WB-02)
    { label: "List", href: "/admin/edges/workboard?view=list", ico: "☰", enabled: true },  // the same cards as rows (W.26)
    { label: "Calendar", href: "/admin/edges/workboard?view=calendar", ico: "▦", enabled: true },  // the month's due dates, day by day, beside a mini month (W.109)
    { label: "Flow", href: "/admin/edges/workboard/flow", ico: "◇", enabled: true },  // the same cards as work in motion (RH-6)
    { label: "Sprint planning", href: "/admin/edges/sprint-planning", ico: "▶", enabled: true },  // not done, next sprint, done this week (SP-01)
    { label: "Domains", href: "/admin/edges/domains", ico: "◆", enabled: true },  // what is open in each domain, across every board (W.53)
  ] },
];

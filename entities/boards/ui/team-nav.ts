// What this entity contributes to the team hub's navigation (ADR 0002). The
// shell owns the information architecture (kernel/shell/team-ia.ts) and names
// the slots; this file names the rows that belong in them. A row appears
// only to someone who may open its page (its declared permission, ADR 0013).
import type { NavContribution } from "@/kernel/shell/nav";

// The team hub's run of the same rows (W.92.1); entities/boards/ui/nav.ts says
// why every view is a nav row and why the page's tab strip went.
//
// Two rows the admin has are missing, and both are missing because the surface
// does not have them rather than because the hub is a cut-down admin. TIMELINE
// is off for /team by Khoa's decision of 2026-09-17 (workboard-surface.ts: the
// hub is where you work this week rather than look at the quarter), and a view
// the codec refuses would be a row that navigates to the board. FLOW and
// DOMAINS have no /team route at all — the pages are admin-only — and a row
// pointing at a 404 is worse than no row. My week leads, because the reason to
// open the hub is usually the day rather than the board.
export const teamNav: NavContribution[] = [
  { section: null, group: "My Work", order: 10, items: [
    { label: "My week", href: "/team/my-week", ico: "◷", enabled: true },  // the reader's own committed week, day by day (W.61)
    { label: "Board", href: "/team/workboard", ico: "▤", enabled: true },  // every board of every assigned client (WB-04)
    { label: "List", href: "/team/workboard?view=list", ico: "☰", enabled: true },  // the same cards as rows (W.26)
    { label: "Calendar", href: "/team/workboard?view=calendar", ico: "▦", enabled: true },  // the month's due dates, day by day, beside a mini month (W.109)
    { label: "Sprint planning", href: "/team/sprint-planning", ico: "▶", enabled: true },  // the same three columns, scoped to their boards (SP-01)
  ] },
];

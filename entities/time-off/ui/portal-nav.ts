// What this entity contributes to the client portal's navigation (ADR 0002).
// The shell owns the information architecture (kernel/shell/portal-ia.ts) and
// names the slots; this file names the rows that belong in them. A row with a
// `when` key appears only for a client whose entitlements include it.
import type { NavContribution } from "@/kernel/shell/nav";

export const portalNav: NavContribution[] = [
  { section: null, group: "People", order: 20, items: [
    { label: "Time Off", href: "/portal/time-off", ico: "☼", enabled: true, when: "timeOff" },
  ] },
];

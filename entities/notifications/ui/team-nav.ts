// What this entity contributes to the team hub's navigation (ADR 0002). Since
// TH.8 the inbox sits at the top, under Home, where work communication is seen:
// inside the Me group it was a row in a collapsed group, and nobody noticed
// what arrived. The row carries a count of the asks from teammates that wait
// on the person (teamNavCounts, through app/shell.ts); reminders and updates
// never count, so the number keeps meaning "someone is waiting on you".
import type { NavContribution } from "@/kernel/shell/nav";

export const teamNav: NavContribution[] = [
  { section: null, group: null, order: 11, items: [{ label: "Inbox", href: "/team/inbox", ico: "✉", icon: "inbox", enabled: true }] },
];

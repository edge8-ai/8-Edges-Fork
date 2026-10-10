// What this entity contributes to the team hub's navigation (ADR 0002). The
// inbox sits under Me because it is each person's own page: what changed on
// their work since they last looked. No count on the row, by design: it is a
// page people choose to open, not a badge that follows them around.
import type { NavContribution } from "@/kernel/shell/nav";

export const teamNav: NavContribution[] = [
  { section: null, group: "Me", order: 5, items: [{ label: "Inbox", href: "/team/inbox", ico: "✉", enabled: true }] },
];

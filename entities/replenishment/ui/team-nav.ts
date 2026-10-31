// What this entity contributes to the Team hub's navigation (ADR 0002): the
// runs sent to the scanners, under My Work, for the operator who works them.
// The shell shows the row only to a viewer whose access reaches the page's
// declared permission (replenishment.work), so nobody else sees it.
import type { NavContribution } from "@/kernel/shell/nav";

export const teamNav: NavContribution[] = [
  { section: null, group: "My Work", order: 40, items: [
    { label: "Replenishment", href: "/team/replenishment", ico: "▤", icon: "check", enabled: true },
  ] },
];

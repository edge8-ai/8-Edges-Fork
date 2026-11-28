// What this entity contributes to the Team hub's navigation (ADR 0002).
// Empty on purpose (2026-11-06): the module was never fully built and Edge8
// does not use it, so no row points at it yet. The route, the permission and
// the tables stay in place. To show it again, restore the row:
//   { section: null, group: "My Work", order: 40, items: [
//     { label: "Replenishment", href: "/team/replenishment", ico: "▤", icon: "check", enabled: true },
//   ] },
// The shell would then show it only to a viewer holding replenishment.work.
import type { NavContribution } from "@/kernel/shell/nav";

export const teamNav: NavContribution[] = [];

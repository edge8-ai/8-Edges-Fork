// What this entity contributes to the client portal's navigation (ADR 0002):
// the training Edge8 runs for the client's placed staff (ADR 0016, amended
// 2026-11-19). The row is lit by the portalTrainingEntitlements slot.
import type { NavContribution } from "@/kernel/shell/nav";

export const portalNav: NavContribution[] = [
  { section: null, group: "People", order: 30, items: [
    { label: "Training", href: "/portal/training", ico: "◆", enabled: true, when: "training" },
  ] },
];

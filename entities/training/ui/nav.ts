// What this entity contributes to the Admin view's navigation (ADR 0002): the
// list of training types, beside the organisation's other configuration, and
// the programme read at Talent › People › Training (ADR 0016), after Reviews.
import type { NavContribution } from "@/kernel/shell/nav";

export const adminNav: NavContribution[] = [
  { section: "Four Offices", group: "Talent", subheading: "People", order: 50, items: [
    { label: "Training", href: "/admin/talent/training", ico: "◆", enabled: true },
  ] },
  { section: "Workspace", group: "Settings", subheading: "Configuration", order: 40, items: [
    { label: "Training types", href: "/admin/settings/training-types", ico: "◆", enabled: true },
  ] },
];

// What this entity contributes to the Admin view's navigation (ADR 0002): the
// list of training types, beside the organisation's other configuration. The
// programme read at Talent › People › Training arrives with TR.7.
import type { NavContribution } from "@/kernel/shell/nav";

export const adminNav: NavContribution[] = [
  { section: "Workspace", group: "Settings", subheading: "Configuration", order: 40, items: [
    { label: "Training types", href: "/admin/settings/training-types", ico: "◆", enabled: true },
  ] },
];

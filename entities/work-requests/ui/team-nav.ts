// What this entity contributes to the team hub's navigation (ADR 0002): a
// contractor's own work requests and payments under Me. The shell shows the row
// only to a viewer whose access reaches work-requests.contractor-work (A.89),
// which every
// contractor holds for their own records, so employees never see it.
import type { NavContribution } from "@/kernel/shell/nav";

export const teamNav: NavContribution[] = [
  { section: null, group: "Me", order: 46, items: [{ label: "My Work and Pay", href: "/team/my-work", ico: "$", icon: "wallet", enabled: true }] },
];

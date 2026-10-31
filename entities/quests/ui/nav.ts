// What this entity contributes to the Admin view's navigation (ADR 0002): the
// manager report (QS.3; ADR 0020) at Talent › People, after Training, because
// it is read to follow up one person privately, as the people pages are. The
// shell shows a row only to someone who may open its page (ADR 0013), so it
// appears to holders of quests.report alone.
import type { NavContribution } from "@/kernel/shell/nav";

export const adminNav: NavContribution[] = [
  { section: "Four Offices", group: "Talent", subheading: "People", order: 60, items: [
    { label: "Quests", href: "/admin/talent/quests", ico: "⚔", enabled: true },
  ] },
];

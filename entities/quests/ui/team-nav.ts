// What this entity contributes to the team hub's navigation (ADR 0002). Quests
// sits under Me beside Ideas, because both are where a person shares what they
// learn. A row shows only to someone who may open its page (ADR 0013).
import type { NavContribution } from "@/kernel/shell/nav";

export const teamNav: NavContribution[] = [
  { section: null, group: "Me", order: 42, items: [
    { label: "Quests", href: "/team/quests", ico: "⚔", icon: "scroll", enabled: true },
  ] },
];

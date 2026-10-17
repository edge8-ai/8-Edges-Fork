// What this entity contributes to the team hub's navigation (ADR 0002). My
// Training sits under Me, right after My Coach, because it is each person's own
// record. Training sits under My Team for whoever organises trainings; a row
// shows only to someone who may open its page (ADR 0013), so a member who
// organises nothing never sees it.
import type { NavContribution } from "@/kernel/shell/nav";

export const teamNav: NavContribution[] = [
  { section: null, group: "Me", order: 12, items: [{ label: "My Training", href: "/team/my-training", ico: "◆", icon: "dumbbell", enabled: true }] },
  { section: null, group: "My Team", order: 30, items: [{ label: "Training", href: "/team/training", ico: "◆", icon: "schedule", enabled: true }] },
];

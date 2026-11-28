// What this entity contributes to the team hub's navigation (ADR 0002): one
// row, Asks, under Me where Quests sat (AK.2, ADR 0036). AK.1 took the Quests
// and Quest report rows out; /team/quests now redirects here (AK.4), and the
// manager report at /team/quests/report still opens by URL. A row shows only to someone who may open its
// page (ADR 0013), so Asks shows to holders of quests.mine. Its count is how
// many asks wait on the reader, which the team layout takes from the
// asksNavCounts slot (lib/asks-count.ts) by this row's address.
import type { NavContribution } from "@/kernel/shell/nav";

export const ASKS_HREF = "/team/asks";

export const teamNav: NavContribution[] = [
  { section: null, group: "Me", order: 42, items: [{ label: "Asks", href: ASKS_HREF, ico: "?", icon: "chat", enabled: true }] },
];

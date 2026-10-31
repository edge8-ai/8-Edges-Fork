// Which sidebar rows this client sees, as a pure function of what it is
// entitled to. It lives beside PortalSidebar rather than inside it because the
// rule is not a rendering concern, and because a rule that decides what a
// client can see should be pinned by a test rather than by reading the JSX.
//
// The rule the portal has always had, and the one that matters: a row this
// client is not entitled to is **muted, never dropped**. The shell then reads
// as complete, and the row lights up the day the entitlement arrives. This is
// the one place the portal differs from the team hub, whose sidebar removes
// the row instead — and getting the two confused is exactly the bug the
// verification pass found after RS-14, where non-entitled rows vanished.
import { isSubsection, type NavEntry, type NavGroup, type NavItem, type NavSection } from "@/kernel/shell/nav";

/** The entitlement keys this client holds, as the capability set rows are gated
 *  on. A row with no `when` is open to every portal member. */
export function entitlementKeys(entitlements: Record<string, boolean>): Set<string> {
  return new Set(Object.keys(entitlements).filter((k) => entitlements[k]));
}

/** Every row the shell composed, with the ones this client has not bought
 *  marked `enabled: false` so they render as a muted "soon" placeholder. */
export function gateByEntitlement(sections: NavSection[], held: Set<string>): NavGroup[] {
  const gate = (entry: NavEntry): NavEntry =>
    isSubsection(entry) || !entry.when || held.has(entry.when) ? entry : { ...entry, enabled: false };
  return sections.flatMap((section) => section.groups.map((group) => ({ ...group, items: group.items.map(gate) })));
}

/** The Delivery group leads with one link per active AI Program, so a program
 *  is one click away from any page. These rows are per-company data rather
 *  than a deployment fact, which is why the composed nav cannot carry them.
 *  They live here, beside the gate, because the sidebar asks the shared
 *  active-row rule over the rows it draws, programs included (W.101), and a
 *  test has to be able to build those same rows without rendering. */
export function withPrograms(groups: NavGroup[], programs: { id: string; name: string }[]): NavGroup[] {
  const links: NavItem[] = programs.map((p) => ({
    label: p.name,
    href: `/portal/programs/${p.id}`,
    ico: "\u21c9",
    enabled: true,
  }));
  return groups.map((g) => (g.label === "Delivery" ? { ...g, items: [...links, ...g.items] } : g));
}

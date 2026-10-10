// The navigation contract between a surface's shell and the entities installed
// in it (ADR 0002, docs/adr/0002-kernel-shells-and-entity-contributions.md).
//
// A surface — Admin, the team hub, the client portal — is a shell the kernel
// owns: the layout, the sidebar chrome and the information architecture. The IA
// is a product decision about how the company is organised, not a fact about
// any one entity, so the skeleton below lives with the shell and names only
// empty slots. Each entity contributes the items that belong in a slot, from its
// browser-safe door, and the composition root hands the shell the contributions
// of the entities this deployment installs (app/nav.ts, generated).
//
// The consequence is the one ADR 0002 wanted: dropping an entity from a
// deployment drops its nav rows with it, and no entity has to know that another
// one exists.

/** A single navigable row. `enabled: false` renders muted with a "soon" tag and
 *  does not navigate, so a shell can look complete before a route exists. */
export type NavItem = {
  label: string;
  href: string;
  ico: string;
  enabled?: boolean;
  /** A capability key the viewer must hold for this row to appear: "coach" on
   *  the team hub, an entitlement on the portal. Deployment decides which rows
   *  exist at all; this decides which of them *this* person sees. The route is
   *  gated server-side regardless. */
  when?: string;
};

/** A labelled run of rows inside a group, e.g. "CRM" inside Revenue. */
export type NavSubsection = { subheading: string; items: NavItem[] };
export type NavEntry = NavItem | NavSubsection;
export type NavGroup = { label: string | null; items: NavEntry[]; collapsible?: boolean };
export type NavSection = { section: string | null; groups: NavGroup[] };

export const isSubsection = (e: NavEntry): e is NavSubsection => "subheading" in e;

// ── The skeleton ────────────────────────────────────────────────────────────
// A slot is addressed by section, group and (optionally) subheading. The shell
// declares the slots in display order; a contribution names one and supplies
// rows. `order` breaks ties inside a slot so two entities contributing to the
// same subheading land in a stable order rather than in install order.

export type SlotId = { section: string | null; group: string | null; subheading?: string };

export type NavSlot = SlotId & {
  /** Rendered even when no installed entity contributes to it. */
  collapsible?: boolean;
};

export type NavContribution = SlotId & { order: number; items: NavItem[] };

const sameSlot = (a: SlotId, b: SlotId) =>
  a.section === b.section && a.group === b.group && (a.subheading ?? null) === (b.subheading ?? null);

/**
 * Fill a shell's slots with the contributions of the entities installed here.
 *
 * Slots nobody contributes to are dropped rather than rendered empty: a
 * deployment without the CRM entity should show no CRM subheading at all, not a
 * heading with nothing under it. Groups and sections left empty by that go the
 * same way, so the IA collapses cleanly around what is installed.
 *
 * A contribution naming a slot the shell does not declare is a bug in the
 * entity, not a reason to render something the IA never planned for, so it
 * throws rather than appending an unplaced row.
 */
export function composeNav(slots: NavSlot[], contributions: NavContribution[]): NavSection[] {
  for (const c of contributions) {
    if (!slots.some((s) => sameSlot(s, c))) {
      throw new Error(
        `nav contribution names no slot in this shell: ${c.section ?? "-"} / ${c.group ?? "-"} / ${c.subheading ?? "-"}`,
      );
    }
  }
  const itemsFor = (slot: NavSlot): NavItem[] =>
    contributions
      .filter((c) => sameSlot(slot, c))
      .sort((a, b) => a.order - b.order)
      .flatMap((c) => c.items);

  const sections: NavSection[] = [];
  for (const slot of slots) {
    const items = itemsFor(slot);
    if (items.length === 0) continue;
    let section = sections.find((s) => s.section === slot.section);
    if (!section) {
      section = { section: slot.section, groups: [] };
      sections.push(section);
    }
    let group = section.groups.find((g) => g.label === slot.group);
    if (!group) {
      group = { label: slot.group, items: [], ...(slot.collapsible ? { collapsible: true } : {}) };
      section.groups.push(group);
    }
    if (slot.subheading) {
      group.items.push({
        subheading: slot.subheading,
        items,
      });
    } else {
      group.items.push(...items);
    }
  }
  return sections;
}

/**
 * Drop the rows whose route this build does not have.
 *
 * An installed entity can still leave part of itself out: the public fork
 * receives campaigns without its marketing screens and org without its surveys
 * (`internalPaths` in entities.manifest.json), while their nav files ship
 * whole. The composition root names those routes as URL patterns, the way Next
 * writes them (`/admin/revenue/marketing`, `/portal/programs/[id]`), and a row
 * goes when its path is one of them or lies beneath it, because a pocket left
 * out takes its sub-pages with it. composeNav then collapses whatever that
 * empties, so a group with nothing left disappears rather than rendering bare.
 */
export function withoutRoutes(contributions: NavContribution[], routes: readonly string[]): NavContribution[] {
  if (routes.length === 0) return contributions;
  const segments = (p: string) => p.split("/").filter(Boolean);
  const patterns = routes.map(segments);
  const gone = (href: string) => {
    const path = segments(splitHref(href).path);
    return patterns.some(
      (pattern) => pattern.length <= path.length && pattern.every((s, i) => /^\[.+\]$/.test(s) || s === path[i]),
    );
  };
  return contributions.map((c) => ({ ...c, items: c.items.filter((item) => !gone(item.href)) }));
}

// ── Active-link resolution ──────────────────────────────────────────────────
// Derived from the composed nav rather than a hand-maintained list. It used to
// be `href === "/admin" || href === "/admin/revenue"`, which meant adding any
// route nested under an existing nav item silently lit up both rows at once: the
// parent matched by prefix and the child matched exactly.

/**
 * The navigation with only the rows `keep` accepts, and every subsection, group
 * and section that leaves empty dropped. The composition root uses it to show a
 * row only to someone who may open the page it links to (ADR 0013), with the
 * same collapse composeNav does for an uninstalled entity, one axis down.
 */
export function keepRows(sections: NavSection[], keep: (item: NavItem) => boolean): NavSection[] {
  const out: NavSection[] = [];
  for (const section of sections) {
    const groups: NavGroup[] = [];
    for (const group of section.groups) {
      const items: NavEntry[] = [];
      for (const entry of group.items) {
        if (isSubsection(entry)) {
          const kept = entry.items.filter(keep);
          if (kept.length > 0) items.push({ ...entry, items: kept });
        } else if (keep(entry)) {
          items.push(entry);
        }
      }
      if (items.length > 0) groups.push({ ...group, items });
    }
    if (groups.length > 0) out.push({ ...section, groups });
  }
  return out;
}

export function navHrefs(sections: NavSection[]): string[] {
  return sections.flatMap((section) =>
    section.groups.flatMap((group) =>
      group.items.flatMap((entry) => (isSubsection(entry) ? entry.items : [entry])).map((item) => item.href),
    ),
  );
}

/**
 * A nav href split into the page it points at and the query it carries.
 *
 * A row may name a query since W.92.1: the Workboard's List, Calendar and
 * Timeline are `?view=` params on one page rather than routes of their own
 * (W.69, so a new view does not move the hardcoded mount totals and make every
 * route-adding PR conflict), and the sidebar has to be able to tell those rows
 * apart from the page they share.
 */
function splitHref(href: string): { path: string; query: URLSearchParams } {
  const cut = href.indexOf("?");
  return cut === -1
    ? { path: href, query: new URLSearchParams() }
    : { path: href.slice(0, cut), query: new URLSearchParams(href.slice(cut + 1)) };
}

/** A link is an index when another nav item lives beneath it (/admin holds
 *  /admin/revenue). Index links match exactly, so they do not light up on every
 *  child route. Compared on the PATH: `?view=list` is the same page, not a
 *  child of it, so a query never makes a row look nested. */
export function indexHrefs(hrefs: string[]): Set<string> {
  const paths = hrefs.map((href) => splitHref(href).path);
  return new Set(
    hrefs.filter((href) => {
      const { path } = splitHref(href);
      return paths.some((other) => other !== path && other.startsWith(`${path}/`));
    }),
  );
}

/**
 * Which rows in the sidebar the address bar is currently on.
 *
 * The pathname decides it for almost every row. Where several rows share one
 * pathname and differ only by a query — the Workboard's Board / List /
 * Calendar / Timeline — the pathname alone would light all four at once, so
 * those rows are compared on their query as well.
 *
 * The comparison runs over every key ANY row of that pathname names, not just
 * the keys this row names, and that is what makes the default row work: the
 * filter codec leaves a param out of the URL when it is at its default
 * (workboard-filter-params.ts), so Board's href carries no `?view=` and is
 * active exactly when the address bar is silent about `view`. Adding a fifth
 * view needs no change here.
 */
export function makeIsActive(
  sections: NavSection[],
): (pathname: string, href: string, search?: string | URLSearchParams) => boolean {
  const hrefs = navHrefs(sections);
  const index = indexHrefs(hrefs);
  const familyKeys = new Map<string, Set<string>>();
  for (const href of hrefs) {
    const { path, query } = splitHref(href);
    const keys = familyKeys.get(path) ?? new Set<string>();
    for (const key of query.keys()) keys.add(key);
    familyKeys.set(path, keys);
  }
  return (pathname, href, search) => {
    const { path, query } = splitHref(href);
    const onPage = index.has(href)
      ? pathname === path || pathname === `${path}/`
      : pathname === path || pathname.startsWith(`${path}/`);
    if (!onPage) return false;
    const keys = familyKeys.get(path);
    if (!keys || keys.size === 0) return true;
    const current = typeof search === "string" ? new URLSearchParams(search) : search ?? new URLSearchParams();
    for (const key of keys) {
      if ((query.get(key) ?? null) !== (current.get(key) ?? null)) return false;
    }
    return true;
  };
}


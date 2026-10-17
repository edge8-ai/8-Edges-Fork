// Pages in the global search (SR.2.3, prototype approved by Khoa on 2026-10-17:
// https://claude.ai/artifact/CsTNGcjhg3oqFKW6dKHk3H). Typing a page's name
// offers the page itself, above the records: "time off" finds Time Off History,
// Requests and Policies, not only cards that mention time off.
//
// The pages are the surface's own navigation, the same generated list the
// sidebar draws (app/nav.ts), so a deployment without an entity has none of its
// pages, and no database is read. The kernel names no entity: the composition
// root hands this the navigation of each surface.
//
// Who sees which page is the page's own declared permission (ADR 0013), checked
// here before the ranking, so the five shown are five the person may open and a
// page they may not open never pushes one out. runSearch checks every hit again.
import { foldDiacritics } from "@/kernel/config/people-name";
import { mayOpenPath } from "@/kernel/identity/permission-lookup";
import { permissionRegistry } from "@/kernel/identity/permission-registry";
import type { SearchSurface } from "@/kernel/identity/search-actor";
import { isSubsection, type NavItem, type NavSection } from "./nav";
import type { SearchContribution, SearchHit } from "./search";

/** One page a surface's navigation links to, with the label of the group it sits in. */
export type NavPage = { label: string; href: string; group: string | null };

/**
 * Every page a navigation links to, once each, in sidebar order. A row that
 * carries a query string is a view of a page already listed (the board's List
 * and Calendar), and a disabled row links nowhere, so neither is a page.
 */
export function navPages(sections: readonly NavSection[]): NavPage[] {
  const seen = new Set<string>();
  const out: NavPage[] = [];
  const add = (item: NavItem, group: string | null) => {
    if (item.enabled === false || item.href.includes("?") || seen.has(item.href)) return;
    seen.add(item.href);
    out.push({ label: item.label, href: item.href, group });
  };
  for (const section of sections) {
    for (const group of section.groups) {
      const where = group.label ?? section.section;
      for (const entry of group.items) {
        if (isSubsection(entry)) for (const item of entry.items) add(item, where);
        else add(entry, where);
      }
    }
  }
  return out;
}

const words = (text: string) => foldDiacritics(text).split(/[^a-z0-9]+/).filter(Boolean);

/** Whether `a` becomes `b` by changing, adding or removing one letter. */
function oneLetterOff(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * How well a page answers the query's words, or null when one word does not
 * match. Every word must start a word of the page's name, sit inside its name,
 * start a word of its group or its path, or (four letters or more) be one
 * letter off a word of its name. A name equal to the query, or starting with
 * it, ranks first. The same tiers as the records' search (SR.2.1), on a page's
 * name rather than a row's text.
 */
export function scorePage(page: NavPage, queryWords: readonly string[]): number | null {
  if (queryWords.length === 0) return null;
  const name = foldDiacritics(page.label);
  const nameWords = words(page.label);
  const elsewhere = words(`${page.group ?? ""} ${page.href.replace(/^\/(admin|team|portal)\/?/, "")}`);
  let score = 0;
  for (const w of queryWords) {
    if (nameWords.some((n) => n.startsWith(w))) score += 30;
    else if (name.includes(w)) score += 10;
    else if (elsewhere.some((n) => n.startsWith(w))) score += 8;
    // A typo against a whole word from four letters, and against the start of a
    // longer word only from five: at four, "acme" is one letter off "acce" and
    // would offer Access codes.
    else if (w.length >= 4 && nameWords.some((n) => oneLetterOff(w, n) || (w.length >= 5 && oneLetterOff(w, n.slice(0, w.length))))) score += 12;
    else return null;
  }
  const query = queryWords.join(" ");
  if (name === query) score += 100;
  else if (name.startsWith(query)) score += 60;
  return score;
}

/** A page as a palette hit: its name, and where it sits. */
function pageHit(page: NavPage): SearchHit {
  return { id: page.href, title: page.label, detail: page.group ? `${page.group} · ${page.href}` : page.href, href: page.href };
}

/**
 * The Pages kind for the surfaces whose navigation is given. It answers on a
 * surface only when that surface has a navigation, and it opens on the
 * surface's home, which everyone holding the surface may open; each page is
 * then held to its own permission.
 */
export function pagesContribution(navs: Readonly<Partial<Record<SearchSurface, readonly NavSection[]>>>): SearchContribution {
  const bySurface = new Map<SearchSurface, NavPage[]>();
  for (const [surface, sections] of Object.entries(navs) as [SearchSurface, readonly NavSection[]][]) {
    bySurface.set(surface, navPages(sections));
  }
  const opens: Partial<Record<SearchSurface, string>> = {};
  for (const surface of bySurface.keys()) opens[surface] = `/${surface}`;
  return {
    kind: "page",
    label: "Pages",
    opens,
    async search(actor, terms, limit) {
      const queryWords = terms.flatMap(words);
      const routes = permissionRegistry().routes;
      const mayOpen = (href: string) => mayOpenPath(routes, (permission) => actor.access.may(permission), href);
      return (bySurface.get(actor.surface) ?? [])
        .filter((page) => mayOpen(page.href))
        .map((page) => ({ page, score: scorePage(page, queryWords) }))
        .filter((x): x is { page: NavPage; score: number } => x.score !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((x) => pageHit(x.page));
    },
  };
}

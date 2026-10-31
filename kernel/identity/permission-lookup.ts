// Which declared permission a URL needs (ADR 0013): the bridge between a link
// (a sidebar row, a search hit, a notification) and the registry, which keys
// pages by their URL pattern ("/team/clients/[companyId]"). Pure and
// browser-safe, so a shell can ask it without a request.

/** The permission the page at `href` declares, or null when no declaration names that page. */
export function permissionForPath(routes: Readonly<Record<string, string>>, href: string): string | null {
  const path = href.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (path in routes) return routes[path];
  const parts = path.split("/");
  for (const [pattern, atom] of Object.entries(routes)) {
    const want = pattern.split("/");
    if (want.length !== parts.length) continue;
    if (want.every((seg, i) => seg === parts[i] || /^\[[^\]]+\]$/.test(seg))) return atom;
  }
  return null;
}

/**
 * Whether someone who holds what `may` says can open the page at `href`: a
 * search hit, a notification or an emailed link (ADR 0013). Closed by default:
 * an href no declaration names, or no href at all, is refused, because a link
 * whose permission nobody can say is a link nobody vouched for. An absolute URL
 * is read by its path, so an email's `https://…/team/…` asks the same question
 * as the page's own path. A public page (a sign-in page) is open to anyone.
 */
export function mayOpenPath(
  routes: Readonly<Record<string, string>>,
  may: (permission: string) => boolean,
  href: string | null | undefined,
): boolean {
  if (!href) return false;
  const permission = permissionForPath(routes, href.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i, ""));
  if (permission === null) return false;
  return permission === "public" || may(permission);
}

// Routes that render standalone, without the public header and footer: the /admin
// CRM, the /team portal, the client portal, the reserve funnel, and the pages
// an outsider opens from a link in an email or a message: surveys, an event's
// sign-up (/events), its ticket (/t) and a contractor's work request (/work).
// Those last three are single centred cards with 40–48px of top padding, so
// the fixed 68px nav covered their first lines on a phone (M5.5); they never
// needed the nav, for the same reason surveys and the reserve funnel do not.
// The private library has its own frame, and so does the App's Front door
// (/front-door, M.17), which carries its own header and footer. On the App's
// host the Front door is served at `/` by a rewrite (next.config.mjs), and the
// browser keeps reading `/`, so the root is bare too: the App has no other page
// there, since the public site's home is the marketing app's.
const BARE_ROUTES = ['/reserve', '/admin', '/team', '/portal', '/surveys', '/events', '/t', '/work', '/front-door']

// Match whole path segments. A plain prefix test would make '/t' swallow
// '/team', '/the-stack' and '/training-and-certification', and '/work'
// swallow '/workflows', stripping the nav from marketing pages.
export function isBareRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  if (pathname === '/') return true
  return BARE_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))
}

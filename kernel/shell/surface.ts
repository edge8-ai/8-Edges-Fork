// Server half of the two-surface helpers (see surface-shared.ts, and ADR 0008
// for why the portal is not a third).

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { SURFACE_HEADER, baseOf, type Surface } from "./surface-shared";

// The surface of the current request, from the header proxy.ts stamps. A
// request the proxy did not see (a cron, a script) reads as admin, which is
// where every shared screen lived before it had a second surface. Async since
// Next 15 made headers() a promise (B.18.2); outside a request it still throws
// synchronously, which the catch turns into admin as before.
export async function currentSurface(): Promise<Surface> {
  try {
    return (await headers()).get(SURFACE_HEADER) === "team" ? "team" : "admin";
  } catch {
    return "admin";
  }
}

// "/admin" or "/team", to prefix a link: `${await surfaceBase()}/revenue/deals`.
export async function surfaceBase(): Promise<"/admin" | "/team"> {
  return baseOf(await currentSurface());
}

// A write made from either surface must refresh the page on both, or the
// other surface keeps serving the stale render. `path` starts after the
// surface, for instance "/revenue/deals".
//
// Two surfaces and not three, deliberately: the portal is the third
// authenticated surface, but it renders every data page per request and has no
// /revenue routes to name, so a third revalidatePath would invalidate nothing
// on paths that do not exist. ADR 0008 records the measurements and what would
// reopen it; scripts/portal-render-is-dynamic.test.mjs guards the premise.
export function revalidateSurfaces(path: string, type?: "page" | "layout"): void {
  revalidatePath(`/admin${path}`, type);
  revalidatePath(`/team${path}`, type);
}

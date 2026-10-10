import type { ViewId } from "./workboard-filter-params";

// Which surface the one Workboard is rendering on, and what that surface
// offers. The board itself never branches on the surface (WB-01) — it asks
// here, once, and hands the answer to the codec, so a ?view= a surface does not
// offer falls back to the board exactly as an unknown sprint id does.

export type Surface = "admin" | "team" | "portal";

export function surfaceOf(pathname: string | null): Surface {
  if (pathname?.startsWith("/team/")) return "team";
  if (pathname?.startsWith("/portal")) return "portal";
  return "admin";
}

// There is no filter layout to ask for any more. W.26 gave /admin and /team a
// fixed rail and left /portal the compact bar; W.89 deleted the rail, so all
// three surfaces render the one toolbar and differ only in how many filters
// they are offered — which workboard-filter-controls.ts already decides from
// the data in view.

// The views each surface offers, in the order the segmented switcher shows
// them. Board and List are everywhere; the table is here, rather than a
// condition in the switcher, because the surface split is a product decision
// per view and this is the one place to read it off.
//
// THREE VIEWS, and the third is the Calendar again since W.109. W.97.5 kept
// the Schedule out of Calendar, Timeline and Schedule because it was the only
// one that said how long a card had been in the air — but it said that from a
// START DATE the data does not have, synthesised from the sprint's `starts_on`
// or the creation day, so almost every bar began on the same Monday. The CEO
// called it "bad and weird" (2026-09-22) and chose the prototype's agenda
// calendar instead. The Schedule's code lives at commit b736475c should it
// come back as a Timeline.
//
// CALENDAR is on for /admin and /team and off for /portal, which is the rule
// both of its predecessors carried (Khoa, 2026-09-17): it is a month of
// INTERNAL due dates, and a client does not need those. So the portal has the
// board and the list.
const VIEWS_BY_SURFACE: Record<Surface, ViewId[]> = {
  admin: ["board", "list", "calendar"],
  team: ["board", "list", "calendar"],
  portal: ["board", "list"],
};

export function viewsFor(surface: Surface): ViewId[] {
  return VIEWS_BY_SURFACE[surface];
}

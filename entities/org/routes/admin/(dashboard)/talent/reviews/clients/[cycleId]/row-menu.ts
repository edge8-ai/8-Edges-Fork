import type { ClientOverviewRow } from "@/entities/org/lib/client-reviews/overview";

// Whether a member's row has anything to put in its More menu (CR.3.8). The
// row's `actions` also carry what other screens offer (the HR summary, the
// skip-manager waiver, release, on the member's page), so "any action at all"
// opened a menu holding only the member's name on a closed cycle, where the
// summary can still be edited and nothing in the menu can. Plain module, not
// the menu's client file, so the server page can call it.

export function hasMenuActions(actions: ClientOverviewRow["actions"], contactCount: number): boolean {
  return (
    actions.new_link ||
    actions.unlock ||
    actions.reopen_member ||
    actions.reopen_client_manager ||
    (actions.change_client_manager && contactCount > 0) ||
    actions.withdraw
  );
}

/**
 * Where the menu goes beside its button (CR.3.8): below it when it fits, else
 * above it, else on the roomier side with its height capped so it scrolls
 * inside itself rather than running past the window's edge. On the live On
 * Target cycle a 431px menu had 369px both above and below a middle row.
 */
export function placeMenu(
  button: { top: number; bottom: number },
  height: number,
  windowHeight: number,
  gap: number,
  edge: number,
): { top: number; maxHeight: number | null } {
  const below = windowHeight - edge - (button.bottom + gap);
  const above = button.top - gap - edge;
  if (height <= below) return { top: button.bottom + gap, maxHeight: null };
  if (height <= above) return { top: button.top - gap - height, maxHeight: null };
  return below >= above ? { top: button.bottom + gap, maxHeight: below } : { top: edge, maxHeight: above };
}

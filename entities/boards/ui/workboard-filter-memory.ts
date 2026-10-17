// Where a surface's last filter set is remembered, the way the Board/List
// toggle is remembered under workboard:view. The pathname is the surface: My
// Work, a hub tab and a single board each keep their own. Split out of
// useWorkboardFilters for the size cap (W.119); what the hook does with the
// remembered set — and why a bare link restores everything but the view — is
// said there and in restoredFilters.
export const FILTERS_KEY_PREFIX = "workboard:filters:";

export function remember(key: string, query: string) {
  try {
    localStorage.setItem(key, query);
  } catch {
    // Storage may be unavailable; the filters still apply to this page.
  }
}

export function recall(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

// Whether the sidebar is folded to icons (the app rail redesign, 25 Oct 2026).
//
// Remembered in a cookie rather than in this browser's storage, so the server
// draws the sidebar folded too and a reload never flashes it open, and so the
// one choice holds in every app: the Team and Admin layouts each read it.

export const SIDEBAR_FOLD_COOKIE = "shell.sidebar";

/** Whether the cookie's value says folded; anything else, absent included, is open. */
export function isSidebarFolded(value: string | undefined): boolean {
  return value === "folded";
}

/** Writes the choice for a year, for every path, so each app's layout reads the same one. */
export function rememberSidebarFold(folded: boolean): void {
  document.cookie = `${SIDEBAR_FOLD_COOKIE}=${folded ? "folded" : "open"}; path=/; max-age=31536000; samesite=lax`;
}

type KeyLike = { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean };

/** Cmd-\ on a Mac, Ctrl-\ elsewhere: the fold's shortcut, as Notion's. */
export function isFoldShortcut(e: KeyLike): boolean {
  return e.key === "\\" && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey;
}

/** What the pull tab on the sidebar's edge does, and what it is called. */
export type EdgeTab = { does: "fold" | "unfold" | "close"; label: string; tip: string };

/**
 * On a wide screen the tab folds the column to icons and pulls it back out.
 * Below 881px the column is the phone drawer, which never folds, and the tab
 * shows only on the open drawer and closes it (TH.32): the drawer covers the
 * menu button that opened it, so without the tab nothing on screen closed it.
 */
export function edgeTab(wide: boolean, folded: boolean): EdgeTab {
  if (!wide) return { does: "close", label: "Close navigation", tip: "Close" };
  return folded
    ? { does: "unfold", label: "Expand sidebar", tip: "Expand" }
    : { does: "fold", label: "Collapse sidebar", tip: "Collapse" };
}

/** The shortcut as the viewer's keyboard prints it. */
export function foldShortcutLabel(platform: string): string {
  return /Mac|iPhone|iPad/.test(platform) ? "⌘\\" : "Ctrl \\";
}

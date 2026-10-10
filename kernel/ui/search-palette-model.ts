// The search palette's behaviour, apart from React so it can be tested without
// a DOM (S.1): which hit the arrows land on, which keys open it, and what the
// shortcut is called on the viewer's keyboard.
import type { SearchGroup, SearchHit } from "@/kernel/shell/search";

export type FlatHit = { hit: SearchHit; index: number };

/** Every hit across the groups, numbered in the order the palette shows them. */
export function flattenHits(groups: readonly SearchGroup[]): FlatHit[] {
  return groups.flatMap((g) => g.hits).map((hit, index) => ({ hit, index }));
}

/**
 * The highlight after an arrow press. It wraps at either end, so the list can be
 * walked from the bottom with one press. Nothing is highlighted when nothing is shown.
 */
export function moveActive(current: number, delta: 1 | -1, count: number): number {
  if (count === 0) return -1;
  if (current < 0) return delta === 1 ? 0 : count - 1;
  return (current + delta + count) % count;
}

type KeyLike = { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean };

/** Cmd-K on a Mac, Ctrl-K elsewhere; K with any other modifier stays the page's. */
export function isPaletteShortcut(e: KeyLike): boolean {
  return e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey;
}

/** The shortcut as the viewer's keyboard prints it. */
export function shortcutLabel(platform: string): string {
  return /Mac|iPhone|iPad/.test(platform) ? "⌘K" : "Ctrl K";
}

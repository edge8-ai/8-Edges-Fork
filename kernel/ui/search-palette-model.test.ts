import { describe, expect, it, vi } from "vitest";
import type { SearchGroup } from "@/kernel/shell/search";
import { flattenHits, hitToOpen, isPaletteShortcut, moveActive, OPEN_SEARCH_EVENT, openSearchPalette, shortcutLabel } from "./search-palette-model";

const group = (kind: string, ids: string[], failed = false): SearchGroup => ({
  kind,
  label: kind,
  failed,
  hits: ids.map((id) => ({ id, title: id, detail: null, href: `/x/${id}` })),
});

describe("the search palette's model", () => {
  it("numbers every hit across the groups, in the order they are shown", () => {
    const flat = flattenHits([group("a", ["1", "2"]), group("b", [], true), group("c", ["3"])]);
    expect(flat.map((f) => [f.hit.id, f.index])).toEqual([
      ["1", 0],
      ["2", 1],
      ["3", 2],
    ]);
  });

  // SR.1.7. While a newer query is being answered the list on screen is the
  // last one, so Enter opens nothing rather than a hit for words typed past.
  it("opens the highlighted hit only from results for the text in the box now", () => {
    const result = { query: "palette", groups: [group("a", ["1", "2"])] };
    expect(hitToOpen(result, "palette", 1)?.id).toBe("2");
    expect(hitToOpen(result, "  palette ", 0)?.id).toBe("1");
    expect(hitToOpen(result, "palette dr", 0)).toBeNull();
    expect(hitToOpen(result, "palette", -1)).toBeNull();
    expect(hitToOpen(null, "palette", 0)).toBeNull();
  });

  it("moves the highlight with the arrows and wraps at either end", () => {
    expect(moveActive(-1, 1, 3)).toBe(0);
    expect(moveActive(-1, -1, 3)).toBe(2);
    expect(moveActive(2, 1, 3)).toBe(0);
    expect(moveActive(0, -1, 3)).toBe(2);
    expect(moveActive(1, 1, 3)).toBe(2);
  });

  it("highlights nothing when there is nothing to highlight", () => {
    expect(moveActive(0, 1, 0)).toBe(-1);
  });

  it("opens on Cmd-K and Ctrl-K, and not on K with another modifier or none", () => {
    const k = { key: "k", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false };
    expect(isPaletteShortcut({ ...k, metaKey: true })).toBe(true);
    expect(isPaletteShortcut({ ...k, ctrlKey: true, key: "K" })).toBe(true);
    expect(isPaletteShortcut(k)).toBe(false);
    expect(isPaletteShortcut({ ...k, metaKey: true, shiftKey: true })).toBe(false);
    expect(isPaletteShortcut({ ...k, ctrlKey: true, altKey: true })).toBe(false);
  });

  it("names the shortcut the way the viewer's keyboard does", () => {
    expect(shortcutLabel("MacIntel")).toBe("⌘K");
    expect(shortcutLabel("iPad")).toBe("⌘K");
    expect(shortcutLabel("Win32")).toBe("Ctrl K");
  });
});

// The phone bar's search button lives outside the palette (TH.5): it can only
// reach the palette through this event, so the event must carry the palette's name.
describe("opening the palette from elsewhere", () => {
  it("dispatches the event the palette listens for", () => {
    const target = new EventTarget();
    (globalThis as { window?: unknown }).window = target;
    const heard = vi.fn();
    target.addEventListener(OPEN_SEARCH_EVENT, heard);
    try {
      openSearchPalette();
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
    expect(heard).toHaveBeenCalledTimes(1);
  });
});

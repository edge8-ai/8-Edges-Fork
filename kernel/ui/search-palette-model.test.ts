import { describe, expect, it } from "vitest";
import type { SearchGroup } from "@/kernel/shell/search";
import { flattenHits, isPaletteShortcut, moveActive, shortcutLabel } from "./search-palette-model";

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

import { afterEach, describe, expect, it, vi } from "vitest";
import { edgeTab, foldShortcutLabel, isFoldShortcut, isSidebarFolded, rememberSidebarFold, SIDEBAR_FOLD_COOKIE } from "./sidebar-fold";

// The sidebar's fold, remembered in a cookie every app's layout reads.
describe("the sidebar's fold", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is folded only when the cookie says so", () => {
    expect(isSidebarFolded("folded")).toBe(true);
    expect(isSidebarFolded("open")).toBe(false);
    expect(isSidebarFolded(undefined)).toBe(false);
    expect(isSidebarFolded("yes")).toBe(false);
  });

  it("is remembered for every path, so both apps read the same choice", () => {
    const doc = { cookie: "" };
    vi.stubGlobal("document", doc);
    rememberSidebarFold(true);
    expect(doc.cookie).toMatch(new RegExp(`^${SIDEBAR_FOLD_COOKIE.replace(".", "\\.")}=folded;.*path=/`));
    rememberSidebarFold(false);
    expect(doc.cookie).toMatch(/=open;/);
  });

  it("toggles on Cmd-\\ or Ctrl-\\ and nothing else", () => {
    const key = (k: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({
      key: k,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      ...mods,
    });
    expect(isFoldShortcut(key("\\", { metaKey: true }))).toBe(true);
    expect(isFoldShortcut(key("\\", { ctrlKey: true }))).toBe(true);
    expect(isFoldShortcut(key("\\"))).toBe(false);
    expect(isFoldShortcut(key("\\", { metaKey: true, shiftKey: true }))).toBe(false);
    expect(isFoldShortcut(key("k", { metaKey: true }))).toBe(false);
  });

  it("prints the shortcut as the keyboard does", () => {
    expect(foldShortcutLabel("MacIntel")).toBe("⌘\\");
    expect(foldShortcutLabel("Win32")).toBe("Ctrl \\");
  });
});

// The pull tab on the sidebar's edge (TH.32): it folds the column on a wide
// screen and closes the phone drawer below 881px, where the drawer covers the
// menu button that opened it.
describe("the sidebar's pull tab", () => {
  it("folds and unfolds the column on a wide screen", () => {
    expect(edgeTab(true, false)).toEqual({ does: "fold", label: "Collapse sidebar", tip: "Collapse" });
    expect(edgeTab(true, true)).toEqual({ does: "unfold", label: "Expand sidebar", tip: "Expand" });
  });

  it("closes the drawer on a narrow screen, whatever the fold remembered", () => {
    expect(edgeTab(false, false)).toEqual({ does: "close", label: "Close navigation", tip: "Close" });
    expect(edgeTab(false, true)).toEqual({ does: "close", label: "Close navigation", tip: "Close" });
  });
});

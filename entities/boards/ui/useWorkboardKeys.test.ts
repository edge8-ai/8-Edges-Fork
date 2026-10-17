import { describe, expect, it } from "vitest";
import { fromAField } from "./useWorkboardKeys";

// W.32's one real bug: a global handler that fires while a text field has
// focus, so typing "n" into the search box creates a card. This is the guard,
// and these are the cases that have to hold.
const ev = (tag: string, over: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; isContentEditable: boolean }> = {}) => ({
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  ...over,
  target: { tagName: tag, isContentEditable: over.isContentEditable ?? false } as unknown as EventTarget,
});

describe("fromAField", () => {
  it("lets a plain key on the page through", () => {
    expect(fromAField(ev("DIV"))).toBe(false);
    expect(fromAField(ev("BODY"))).toBe(false);
  });

  it("keeps out of every field someone can type in", () => {
    for (const tag of ["INPUT", "TEXTAREA", "SELECT"]) expect(fromAField(ev(tag))).toBe(true);
    expect(fromAField(ev("DIV", { isContentEditable: true }))).toBe(true);
  });

  it("keeps off a focused button, whose own key handling is the browser's", () => {
    expect(fromAField(ev("BUTTON"))).toBe(true);
  });

  it("never takes a modifier chord — those belong to the browser", () => {
    expect(fromAField(ev("DIV", { metaKey: true }))).toBe(true);
    expect(fromAField(ev("DIV", { ctrlKey: true }))).toBe(true);
    expect(fromAField(ev("DIV", { altKey: true }))).toBe(true);
  });
});

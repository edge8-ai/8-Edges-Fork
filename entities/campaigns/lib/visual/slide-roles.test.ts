import { describe, expect, it } from "vitest";
import { ART_FOR_ROLE, pickSlides, type SlideRole } from "./slide-roles";

const slide = (id: string, role: SlideRole) => ({ id, role });
const carousel = [slide("1", "hook"), slide("2", "support"), slide("3", "key"), slide("4", "close")];
const ids = (s: { id: string }[]) => s.map((x) => x.id);

describe("pickSlides (Regenerate: Layout 4 / 2 / 1)", () => {
  it("Layout 4 makes every slide again", () => {
    expect(ids(pickSlides(carousel, 4))).toEqual(["1", "2", "3", "4"]);
  });

  it("Layout 2 makes the hook and the key point, in slide order", () => {
    expect(ids(pickSlides(carousel, 2))).toEqual(["1", "3"]);
    const keyFirst = [slide("a", "key"), slide("b", "hook"), slide("c", "close")];
    expect(ids(pickSlides(keyFirst, 2))).toEqual(["a", "b"]);
  });

  it("Layout 1 makes the hook alone", () => {
    expect(ids(pickSlides(carousel, 1))).toEqual(["1"]);
    expect(ids(pickSlides([slide("a", "support"), slide("b", "hook")], 1))).toEqual(["b"]);
  });

  it("falls back to the first slide, then the next, when roles are missing", () => {
    const unmarked = [slide("a", "support"), slide("b", "support"), slide("c", "close")];
    expect(ids(pickSlides(unmarked, 1))).toEqual(["a"]);
    expect(ids(pickSlides(unmarked, 2))).toEqual(["a", "b"]);
  });

  it("never asks for more than the set has", () => {
    expect(ids(pickSlides([slide("x", "hook")], 4))).toEqual(["x"]);
    expect(ids(pickSlides([slide("x", "hook")], 2))).toEqual(["x"]);
    expect(pickSlides([], 1)).toEqual([]);
  });
});

describe("ART_FOR_ROLE", () => {
  it("keeps the busy slides to the corner wedge", () => {
    expect(ART_FOR_ROLE).toEqual({ hook: "hook", key: "corner", support: "corner", close: "close" });
  });
});

import { describe, expect, it } from "vitest";
import { nextSort, paginate } from "./useClientTable";

// The repo has no @testing-library/react (vitest runs in the node environment),
// so the hook's arithmetic lives in these two pure functions and is pinned here.
// They are the exact expressions the three admin tables carried inline.

describe("paginate", () => {
  it("reproduces the inline math for a full page", () => {
    expect(paginate(120, 2, 25)).toEqual({
      totalPages: 5,
      clampedPage: 2,
      startIdx: 25,
      start: 26,
      end: 50,
    });
  });

  it("keeps a single page and a zero start when the set is empty", () => {
    expect(paginate(0, 1, 25)).toEqual({ totalPages: 1, clampedPage: 1, startIdx: 0, start: 0, end: 0 });
  });

  it("clamps a page that a narrowed filter left out of range", () => {
    // Page 7 of a set that now holds 30 rows: fall back to the last page.
    expect(paginate(30, 7, 25)).toEqual({ totalPages: 2, clampedPage: 2, startIdx: 25, start: 26, end: 30 });
  });

  it("ends on the total, not on the page boundary, for a partial last page", () => {
    expect(paginate(30, 2, 25).end).toBe(30);
  });

  it("treats a set that exactly fills the page as one page", () => {
    expect(paginate(25, 1, 25)).toEqual({ totalPages: 1, clampedPage: 1, startIdx: 0, start: 1, end: 25 });
  });
});

describe("nextSort", () => {
  it("starts a text column ascending and a desc-first column descending", () => {
    expect(nextSort(null, "title", ["applied"])).toEqual({ key: "title", dir: "asc" });
    expect(nextSort(null, "applied", ["applied"])).toEqual({ key: "applied", dir: "desc" });
  });

  it("flips the direction when the active column is clicked again", () => {
    expect(nextSort({ key: "title", dir: "asc" }, "title")).toEqual({ key: "title", dir: "desc" });
    expect(nextSort({ key: "title", dir: "desc" }, "title")).toEqual({ key: "title", dir: "asc" });
  });

  it("resets to the new column's natural direction, not the old one's", () => {
    expect(nextSort({ key: "applied", dir: "asc" }, "title", ["applied"])).toEqual({
      key: "title",
      dir: "asc",
    });
  });
});

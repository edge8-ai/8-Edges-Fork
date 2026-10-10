import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// A planning lane's heading is pinned to one height so the first cards of the
// three lanes line up (W.114). The lane body is a flex column, so the pin only
// holds if the heading cannot shrink: without `flex: none`, a lane long enough
// to scroll shrank a label with its count pill to 20px and an empty slot to
// 16.5px, and production showed Not done's first card 3-4px low.
describe("the planning lane heading", () => {
  it("is pinned to one height and never shrinks", () => {
    const css = readFileSync("app/admin/admin.css", "utf8");
    const rule = css.match(/\.admin-sprint-panel \.admin-kanban-col-section \{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toContain("height: 20px");
    expect(rule).toMatch(/flex: none|flex-shrink: 0/);
  });
});

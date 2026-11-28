import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkboardColumnHead } from "./WorkboardColumnHead";

// W.31. The limit is INFORMATION about a column: never a block, and never a
// figure about a person.
const col = { id: "Doing", label: "Doing" };
const html = (count: number, limit: number | undefined, collapsed = false) =>
  renderToStaticMarkup(
    <WorkboardColumnHead column={col} count={count} limit={limit} collapsed={collapsed} onToggle={() => {}} />,
  );

describe("WorkboardColumnHead", () => {
  it("reads count over limit", () => {
    expect(html(3, 5)).toContain("3 / 5");
  });

  it("reads the bare count when the column claims no limit", () => {
    // Every column draws this head since W.92.4, because every column has the
    // fold; one without a limit must read exactly as the kernel's default did.
    const bare = html(3, undefined);
    expect(bare).toContain('class="admin-kanban-col-count">3<');
    expect(bare).not.toContain("limit");
  });

  it("turns amber over the cap, and only then", () => {
    expect(html(7, 5)).toContain("is-over-limit");
    expect(html(5, 5)).not.toContain("is-over-limit");
    expect(html(4, 5)).not.toContain("is-over-limit");
  });

  it("says out loud that nothing is blocked", () => {
    expect(html(7, 5)).toContain("Nothing is blocked");
  });

  it("offers the fold as a named, state-carrying control (W.92.4)", () => {
    // A bare chevron is invisible to a screen reader and ambiguous to
    // everybody else, so the fold says which column it folds and which way it
    // currently is.
    expect(html(3, 5, false)).toContain('aria-expanded="true"');
    expect(html(3, 5, false)).toContain('aria-label="Collapse Doing"');
    expect(html(3, 5, true)).toContain('aria-expanded="false"');
    expect(html(3, 5, true)).toContain('aria-label="Expand Doing"');
  });

  it("keeps the true count while folded", () => {
    // A folded column holds every card it held; hiding the cards must not
    // make the board look like work disappeared.
    expect(html(7, 5, true)).toContain("7 / 5");
  });

  it("never claims something failed", () => {
    // Amber, not red: a column over its limit is a question worth asking,
    // not an error. The error tokens are reserved for things that went wrong.
    expect(html(7, 5)).not.toContain("err");
  });
});

describe("the WIP limit's write path", () => {
  const source = readFileSync(new URL("../lib/column-actions.ts", import.meta.url), "utf8");

  it("has no per-person dimension anywhere in it", () => {
    // The house rule, enforced where it can be: a limit describes a column.
    // There is no assignee, owner or person id in the action that sets one,
    // and an accidental one would fail here.
    for (const forbidden of ["assignee", "owner_id", "person_id", "moved_by", "per_person"]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("never refuses a move: the limit is not read by anything that writes a column", () => {
    const moveCard = readFileSync(new URL("../lib/move-card.ts", import.meta.url), "utf8");
    expect(moveCard).not.toContain("wip_limit");
  });
});

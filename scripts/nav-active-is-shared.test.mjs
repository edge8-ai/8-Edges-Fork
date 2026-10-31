import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Which sidebar row the address bar is on is one rule, and kernel/shell/nav's
// `makeIsActive` is where it lives: a row may be told apart from its siblings by
// a query (`?view=list`), an index row matches exactly so it does not light on
// every child, and a trailing slash is not a different page. Every one of those
// is a case somebody gets wrong writing the four-line version by hand.
//
// W.100 is what this guard is for. TeamSidebar carried its own copy —
// `pathname === href || pathname.startsWith(href + "/")` — which compares the
// pathname against the WHOLE href, query included. A row carrying `?view=` could
// therefore never match, and the query-less Board row matched all of them: on
// /team/workboard?view=schedule the sidebar said Board. The logic was right in
// the kernel the whole time; the component simply was not asking it.
//
// So: a component that renders nav rows takes its active state from the kernel,
// never from a local reimplementation (CLAUDE.md rule 3).

const RENDERS_NAV_ROWS = [
  "kernel/shell/AdminNav.tsx",
  "entities/team/ui/TeamSidebar.tsx",
  "entities/portal/ui/PortalSidebar.tsx",
];

// A component may sit here only with a reason, and the reason has to say what
// the local copy does differently and what it would cost to move. It is empty
// since W.101 moved PortalSidebar onto the shared rule. That move turned out to
// be a no-op for clients: the local copy already matched `/portal` exactly, and
// app/nav.test.ts proves the two agree on every composed portal row.
const ALLOWED = new Map();

describe("a sidebar takes its active row from the kernel", () => {
  for (const file of RENDERS_NAV_ROWS) {
    const reason = ALLOWED.get(file);
    it(`${file}${reason ? " is allowlisted, with a reason" : " uses makeIsActive"}`, () => {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      if (reason) {
        expect(reason.length).toBeGreaterThan(80);
        return;
      }
      expect(source).toContain("makeIsActive");
      // The shape of the hand-rolled version, which is the bug: comparing a
      // pathname against an href that may carry a query.
      expect(source).not.toMatch(/pathname\s*===\s*href/);
      expect(source).not.toMatch(/pathname\.startsWith\(`\$\{href\}/);
    });
  }
});

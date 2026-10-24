import { describe, expect, it } from "vitest";

// SR.2.3. The parts of Pages in the global search that need no deployment: which
// rows of a navigation are pages, and how a page answers a query's words. The
// contribution itself is tested against this deployment's real navigation and
// permission registry in app/__tests__/search-pages.test.ts, because kernel/
// may not import app/.
import type { NavSection } from "./nav";
import { navPages, scorePage } from "./search-pages";

const FIXTURE: NavSection[] = [
  {
    section: "Four offices",
    groups: [
      {
        label: "Operations",
        items: [
          { label: "Requests", href: "/admin/operations/time-off/requests", ico: "" },
          { subheading: "Money", items: [{ label: "Reimbursements", href: "/admin/finance/reimbursements", ico: "" }] },
          { label: "Board list", href: "/admin/edges/workboard?view=list", ico: "" },
          { label: "Soon", href: "/admin/soon", ico: "", enabled: false },
          { label: "Requests again", href: "/admin/operations/time-off/requests", ico: "" },
        ],
      },
    ],
  },
  { section: null, groups: [{ label: null, items: [{ label: "Agents", href: "/admin/settings/agents", ico: "" }] }] },
];

describe("navPages", () => {
  it("lists each linked page once, with its group, skipping views of a page and disabled rows", () => {
    expect(navPages(FIXTURE)).toEqual([
      { label: "Requests", href: "/admin/operations/time-off/requests", group: "Operations" },
      { label: "Reimbursements", href: "/admin/finance/reimbursements", group: "Operations" },
      { label: "Agents", href: "/admin/settings/agents", group: null },
    ]);
  });
});

describe("scorePage", () => {
  const page = { label: "Time Off History", href: "/admin/operations/time-off/history", group: "Operations" };
  it("ranks the name before the group and the path, and an exact name first", () => {
    const exact = scorePage({ ...page, label: "Time Off" }, ["time", "off"])!;
    const start = scorePage(page, ["time", "off"])!;
    const byPath = scorePage({ label: "Requests", href: "/admin/operations/time-off/requests", group: "Operations" }, ["time", "off"])!;
    expect(exact).toBeGreaterThan(start);
    expect(start).toBeGreaterThan(byPath);
  });
  it("needs every word, ignores accents, and forgives one letter in a word of four or more", () => {
    expect(scorePage(page, ["time", "payroll"])).toBeNull();
    expect(scorePage({ label: "Tài liệu", href: "/team/docs", group: null }, ["tai"])).not.toBeNull();
    expect(scorePage({ label: "Payroll", href: "/team/finance/payroll", group: "Finance" }, ["payrol"])).not.toBeNull();
    expect(scorePage({ label: "Payroll", href: "/team/finance/payroll", group: "Finance" }, ["pay", "x"])).toBeNull();
    // Four letters are forgiven against a whole word only: "acme" is not a typo of "access".
    expect(scorePage({ label: "Access codes", href: "/admin/settings/access-codes", group: null }, ["acme"])).toBeNull();
    expect(scorePage({ label: "Reimbursements", href: "/admin/finance/reimbursements", group: "Operations" }, ["reimbr"])).not.toBeNull();
  });
});

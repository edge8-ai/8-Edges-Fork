import { describe, expect, it } from "vitest";
import { composeNav, keepRows, makeIsActive, withoutRoutes, type NavContribution, type NavSection, type NavSlot } from "./nav";

const SLOTS: NavSlot[] = [
  { section: "OS", group: "Edges", collapsible: true },
  { section: "Offices", group: "Revenue", collapsible: true },
  { section: "Offices", group: "Revenue", subheading: "CRM" },
  { section: "Offices", group: "Revenue", subheading: "Commerce" },
  { section: "Offices", group: "Talent", subheading: "ATS" },
];

const row = (label: string, href: string) => ({ label, href, ico: "*", enabled: true });

describe("composeNav", () => {
  it("orders rows inside a slot by order, not by which entity contributed first", () => {
    const late: NavContribution = { section: "OS", group: "Edges", order: 20, items: [row("B", "/b")] };
    const early: NavContribution = { section: "OS", group: "Edges", order: 10, items: [row("A", "/a")] };
    const [section] = composeNav(SLOTS, [late, early]);
    expect(section.groups[0].items.map((i) => "label" in i && i.label)).toEqual(["A", "B"]);
  });

  it("drops a slot nobody contributes to, and the group and section it empties", () => {
    const sections = composeNav(SLOTS, [
      { section: "Offices", group: "Revenue", subheading: "CRM", order: 10, items: [row("Deals", "/deals")] },
    ]);
    // No OS section at all, no Commerce subheading, no ATS: a deployment
    // without those entities shows no empty headings.
    expect(sections.map((s) => s.section)).toEqual(["Offices"]);
    expect(sections[0].groups).toHaveLength(1);
    expect(sections[0].groups[0].items).toHaveLength(1);
  });

  it("puts a subheading slot's rows under its subheading", () => {
    const [section] = composeNav(SLOTS, [
      { section: "Offices", group: "Talent", subheading: "ATS", order: 10, items: [row("Jobs", "/jobs")] },
    ]);
    const [sub] = section.groups[0].items;
    expect("subheading" in sub && sub.subheading).toBe("ATS");
  });

  it("refuses a contribution naming a slot this shell does not declare", () => {
    expect(() =>
      composeNav(SLOTS, [{ section: "Offices", group: "Revenue", subheading: "Nope", order: 1, items: [] }]),
    ).toThrow(/names no slot/);
  });
});

describe("makeIsActive", () => {
  const sections = composeNav(SLOTS, [
    { section: "Offices", group: "Revenue", order: 5, items: [row("Cockpit", "/admin/revenue")] },
    {
      section: "Offices",
      group: "Revenue",
      subheading: "CRM",
      order: 10,
      items: [row("Deals", "/admin/revenue/deals")],
    },
  ]);
  const isActive = makeIsActive(sections);

  it("matches an index link exactly, so a child route does not light up its parent", () => {
    expect(isActive("/admin/revenue", "/admin/revenue")).toBe(true);
    expect(isActive("/admin/revenue/deals", "/admin/revenue")).toBe(false);
  });

  it("matches a leaf link by prefix, so a detail page keeps its row lit", () => {
    expect(isActive("/admin/revenue/deals/abc", "/admin/revenue/deals")).toBe(true);
  });
});

// W.92.1. The Workboard's views are `?view=` params on one page rather than
// routes of their own (W.69), so several sidebar rows share a pathname and
// the pathname alone would light every one of them at once.
describe("makeIsActive, where rows differ only by a query", () => {
  const WB = "/admin/edges/workboard";
  const sections = composeNav(SLOTS, [
    {
      section: "OS",
      group: "Edges",
      order: 10,
      items: [
        row("Board", WB),
        row("List", `${WB}?view=list`),
        row("Calendar", `${WB}?view=calendar`),
        row("Flow", `${WB}/flow`),
      ],
    },
  ]);
  const isActive = makeIsActive(sections);

  it("lights exactly one view row", () => {
    const lit = (search: string) =>
      [WB, `${WB}?view=list`, `${WB}?view=calendar`].filter((href) => isActive(WB, href, search));
    expect(lit("")).toEqual([WB]);
    expect(lit("?view=list")).toEqual([`${WB}?view=list`]);
    expect(lit("?view=calendar")).toEqual([`${WB}?view=calendar`]);
  });

  it("gives the default view the row with no query, because the codec omits a default", () => {
    // workboard-filter-params.ts leaves a filter OUT of the URL when it is at
    // its default, so ?view=board is never written and Board's href carries
    // no query. Silence about `view` is what makes Board current.
    expect(isActive(WB, WB, "")).toBe(true);
    expect(isActive(WB, WB, "?view=board")).toBe(false);
    expect(isActive(WB, WB, "?view=list")).toBe(false);
  });

  it("still matches with the trailing slash next.config.mjs serves", () => {
    // `trailingSlash: true`, so the pathname the sidebar is handed is
    // "/admin/edges/workboard/" while the href in the contribution is written
    // without one. Board is an index link (Flow lives beneath it), and it is
    // the index branch that has to tolerate the slash — a leaf link gets it
    // free from the prefix match.
    expect(isActive(`${WB}/`, WB, "")).toBe(true);
    expect(isActive(`${WB}/`, `${WB}?view=list`, "?view=list")).toBe(true);
    expect(isActive(`${WB}/`, `${WB}?view=list`, "")).toBe(false);
    expect(isActive(`${WB}/flow/`, `${WB}/flow`, "")).toBe(true);
    expect(isActive(`${WB}/flow/`, WB, "")).toBe(false);
  });

  it("ignores params no row names, so a filtered board still lights its view", () => {
    expect(isActive(WB, WB, "?client=acme&sort=due")).toBe(true);
    expect(isActive(WB, `${WB}?view=list`, "?view=list&client=acme&q=deck")).toBe(true);
  });

  it("does not treat a query as a child route", () => {
    // `?view=list` is the same page, not something nested under it, so it
    // must not make Board an index link's parent or light Flow's row.
    expect(isActive(`${WB}/flow`, `${WB}?view=list`)).toBe(false);
    expect(isActive(`${WB}/flow`, `${WB}/flow`, "")).toBe(true);
    // Board is an index link (Flow lives beneath it), so Flow's page must not
    // light Board.
    expect(isActive(`${WB}/flow`, WB, "")).toBe(false);
  });

  it("leaves every other row exactly as it was", () => {
    // A row whose pathname no other row shares never consults the query.
    expect(isActive("/admin/revenue/deals/abc", "/admin/revenue/deals", "?anything=1")).toBe(true);
  });
});

// The public fork receives an entity without its internal pockets but with its
// whole nav file, so the composition root names the routes the build lacks and
// their rows must leave with them (B.32).
describe("withoutRoutes", () => {
  const revenue: NavContribution = {
    section: "Offices",
    group: "Revenue",
    order: 10,
    items: [
      row("Deals", "/admin/revenue/deals"),
      row("Overview", "/admin/revenue/marketing"),
      row("Campaigns", "/admin/revenue/marketing/campaigns?tab=live"),
      row("Marketplace", "/admin/revenue/marketingplace"),
    ],
  };
  const labels = (cs: NavContribution[]) => cs.flatMap((c) => c.items.map((i) => i.label));

  it("drops the rows at or beneath a missing route, query or not, and nothing that only shares a prefix", () => {
    expect(labels(withoutRoutes([revenue], ["/admin/revenue/marketing"]))).toEqual(["Deals", "Marketplace"]);
  });

  it("reads a dynamic segment as any one segment", () => {
    const programs: NavContribution = {
      ...revenue,
      items: [row("Programs", "/portal/programs"), row("Brief", "/portal/programs/abc")],
    };
    expect(labels(withoutRoutes([programs], ["/portal/programs/[id]"]))).toEqual(["Programs"]);
  });

  it("returns the contributions untouched when every route is mounted", () => {
    const all = [revenue];
    expect(withoutRoutes(all, [])).toBe(all);
  });

  it("lets composeNav collapse a slot the missing routes emptied", () => {
    const marketing: NavContribution = {
      section: "Offices",
      group: "Revenue",
      subheading: "Commerce",
      order: 10,
      items: [row("Overview", "/admin/revenue/marketing")],
    };
    const sections = composeNav(SLOTS, withoutRoutes([marketing], ["/admin/revenue/marketing"]));
    expect(sections).toEqual([]);
  });
});

describe("keepRows", () => {
  const sections: NavSection[] = [
    { section: null, groups: [
      { label: "Me", items: [row("Profile", "/team/profile"), row("Directory", "/team/directory")] },
      { label: "Company", items: [row("Goals", "/team/company-goals")] },
    ] },
  ];

  it("keeps only the rows the test accepts, and drops a group it empties", () => {
    const kept = keepRows(sections, (item) => item.href !== "/team/directory" && item.href !== "/team/company-goals");
    expect(kept[0].groups.map((g) => g.label)).toEqual(["Me"]);
    expect(kept[0].groups[0].items.map((i) => "label" in i && i.label)).toEqual(["Profile"]);
  });

  it("drops a section with nothing left in it", () => {
    expect(keepRows(sections, () => false)).toEqual([]);
  });
});

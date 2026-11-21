import { describe, expect, it } from "vitest";
import { capLines, dayTitle, isEmpty, PER_PERSON_CAP, renderLine, renderList, type ListLine } from "./office-list";

const ORIGIN = "https://site.example.test";

describe("morning list format", () => {
  it("writes a line as who, what, and one named link", () => {
    expect(renderLine({ who: "Dave", text: "Reply today.", href: "/admin/revenue/leads" }, ORIGIN)).toBe(
      "- **Dave:** Reply today. [Open](https://site.example.test/admin/revenue/leads)",
    );
  });

  it("drops the link when there is no origin rather than writing a bare path", () => {
    expect(renderLine({ who: "Dave", text: "Reply today.", href: "/admin/revenue/leads" }, "")).toBe("- **Dave:** Reply today.");
  });

  it("caps each person's lines and folds the rest into one line", () => {
    const many: ListLine[] = Array.from({ length: PER_PERSON_CAP + 2 }, (_, i) => ({ who: "Dave", text: `item ${i}` }));
    const out = capLines([...many, { who: "Khoa", text: "one" }]);
    expect(out.filter((l) => l.who === "Dave")).toHaveLength(PER_PERSON_CAP + 1);
    expect(out.at(-1)).toEqual({ who: "Dave", text: "and 2 more.", href: undefined });
  });

  it("never folds planning facts", () => {
    const facts: ListLine[] = Array.from({ length: 6 }, (_, i) => ({ who: null, text: `fact ${i}` }));
    expect(capLines(facts)).toHaveLength(6);
  });

  it("is empty when every section is, so nothing is sent", () => {
    expect(isEmpty({ title: "Talent", sections: [{ title: "Hiring", lines: [] }] })).toBe(true);
  });

  it("renders one card with a header and only the non-empty sections, with no ids, route paths or emoji", () => {
    const card = renderList(
      {
        title: `Revenue · ${dayTitle("2026-11-19")}`,
        sections: [
          { title: "Sales", lines: [{ who: "Dave", text: "2 new leads to answer.", href: "/admin/revenue/leads" }] },
          { title: "Marketing", lines: [] },
        ],
      },
      ORIGIN,
    ) as { card: { header: { title: { content: string } }; elements: { content: string }[] } };
    expect(card.card.header.title.content).toBe("Revenue · Thu 19 Nov");
    const body = card.card.elements[0].content;
    expect(body).toContain("**Sales**");
    expect(body).not.toContain("Marketing");
    expect(body).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(body.replace(/\(https:\/\/site\.example\.test\/[^)]*\)/g, "")).not.toMatch(/\/admin\/|\/api\//);
    expect(body).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

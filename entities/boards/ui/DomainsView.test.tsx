import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { EpicRow } from "@/entities/boards/lib/types";

// The table's search box is a client island that reaches for the App Router.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }) }));

const { DomainsView } = await import("./DomainsView");
import { domainRows } from "./domain-rows";
// W.53, rendered. The model tests prove the arithmetic; this proves the page
// says what the model knows — above all that every row names its board, which
// is the one thing that makes two same-named domains readable as two things.

const NOW = Date.parse("2026-09-20T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const boards = [
  { id: "b1", name: "8 Edges", slug: "8-edges" },
  { id: "b2", name: "Acme", slug: "acme" },
];

const epic = (id: string, board: string, name: string, over: Partial<EpicRow> = {}): EpicRow => ({
  id,
  board_id: board,
  name,
  description: null,
  color: null,
  status: "active",
  sort_order: 0,
  ...over,
});

const card = (board: string, epicId: string, over: Partial<{ status: string; human_tokens: number | null; last_moved_at: string }> = {}) => ({
  board_id: board,
  epic_id: epicId,
  status: "open",
  human_tokens: 1,
  last_moved_at: daysAgo(1),
  ...over,
});

const render = (epics: EpicRow[], cards: ReturnType<typeof card>[], searchParams: Record<string, string> = {}) =>
  renderToStaticMarkup(<DomainsView model={domainRows(boards, epics, cards, NOW)} searchParams={searchParams} />);

describe("the Domains page", () => {
  it("is the design system's table and KPI strip, not a bespoke list", () => {
    const out = render([epic("e1", "b1", "Ops")], [card("b1", "e1")]);
    expect(out).toContain("admin-kpi-grid");
    expect(out).toContain("admin-table");
    expect(out).not.toContain("admin-epic-");
  });

  it("names the board on every row, so two same-named domains read as two things", () => {
    const out = render([epic("e1", "b1", "Marketing"), epic("e2", "b2", "Marketing")], [card("b1", "e1", { human_tokens: 5 }), card("b2", "e2")]);
    expect(out).toContain("8 Edges");
    expect(out).toContain("Acme");
    expect(out.match(/Marketing/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("prints Human Tokens with the decimals an estimate carries, not a float", () => {
    const out = render([epic("e1", "b1", "Ops")], [card("b1", "e1", { human_tokens: 0.1 }), card("b1", "e1", { human_tokens: 0.2 })]);
    expect(out).toContain(">0.3<");
    expect(out).not.toContain("0.30000000000000004");
  });

  it("says a domain is moving when its cards are, and how long a still one has been still", () => {
    const out = render(
      [epic("e1", "b1", "Moving"), epic("e2", "b1", "Still")],
      [card("b1", "e1"), card("b1", "e2", { last_moved_at: daysAgo(30) })],
    );
    expect(out).toContain("1 moved this week");
    expect(out).toContain("still for 30d");
  });

  it("puts the heaviest open work first by default", () => {
    const out = render([epic("e1", "b1", "Light"), epic("e2", "b1", "Heavy")], [card("b1", "e1", { human_tokens: 1 }), card("b1", "e2", { human_tokens: 9 })]);
    expect(out.indexOf("Heavy")).toBeLessThan(out.indexOf("Light"));
  });

  it("explains itself when there are no domains at all rather than rendering an empty table", () => {
    expect(render([], [])).toContain("No domains yet");
  });

  // The house rule: no metric describes a person. The page reads cards that
  // carry an assignee and must never surface one.
  it("names no person and slices nothing by one", () => {
    const out = render([epic("e1", "b1", "Ops")], [card("b1", "e1")]);
    expect(out).not.toMatch(/assignee|owner_id|moved_by/i);
  });
});

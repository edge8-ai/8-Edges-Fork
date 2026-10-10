import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { BoardDetail } from "@/entities/boards/lib/data";
import type { EpicRow as Epic } from "@/entities/boards/lib/types";

// DataTable's search box (kernel/ui/TableSearch) reaches for the App Router,
// which does not exist off a request. The page's reading is what is under
// test, not its search.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

const { EpicsView } = await import("./EpicsView");

// The epics page, rendered: the design system's KPI strip and table, epics
// A to Z, the archived toggle, and the figures a person acts on.

const epic = (id: string, name: string, over: Partial<Epic> = {}): Epic => ({
  id,
  board_id: "b1",
  name,
  description: null,
  color: null,
  status: "active",
  sort_order: 0,
  ...over,
});

const card = (epicId: string | null, over: Partial<{ status: string; human_tokens: number | null }> = {}) => ({
  epic_id: epicId,
  status: "open",
  human_tokens: 1,
  ...over,
});

function detail(epics: Epic[], cards: ReturnType<typeof card>[]): BoardDetail {
  return {
    board: { id: "b1", slug: "8-edges", name: "8 Edges" },
    epics,
    cards,
  } as unknown as BoardDetail;
}

const render = (epics: Epic[], cards: ReturnType<typeof card>[], canManage = true, searchParams: Record<string, string> = {}) =>
  renderToStaticMarkup(<EpicsView detail={detail(epics, cards)} surface="/admin" canManage={canManage} searchParams={searchParams} />);

describe("the epics page", () => {
  it("is the design system's table and KPI strip, not a bespoke list", () => {
    const out = render([epic("e1", "Commerce")], [card("e1")]);
    expect(out).toContain("admin-kpi-grid");
    expect(out).toContain("admin-table");
    expect(out).not.toContain("admin-epic-");
  });

  it("lists epics A to Z by default, whatever order they arrive in", () => {
    const out = render([epic("e1", "Talent"), epic("e2", "commerce"), epic("e3", "Marketing")], []);
    const at = (n: string) => out.indexOf(`</span>${n}`);
    expect(at("commerce")).toBeLessThan(at("Marketing"));
    expect(at("Marketing")).toBeLessThan(at("Talent"));
  });

  it("shows open, done and Human Tokens delivered of estimated per epic", () => {
    const out = render([epic("e1", "Commerce")], [card("e1", { human_tokens: 3, status: "done" }), card("e1", { human_tokens: 1 })]);
    expect(out).toContain("3 / 4");
    expect(out).toContain("75%");
  });

  it("prints a sum of grid-sized cards as an estimate, not as a float", () => {
    const out = render([epic("e1", "Commerce")], [card("e1", { human_tokens: 0.1 }), card("e1", { human_tokens: 0.2 })]);
    expect(out).toContain("0.3");
    expect(out).not.toContain("0.30000000000000004");
  });

  it("counts cards with no epic and links to them", () => {
    const out = render([epic("e1", "Commerce")], [card("e1"), card(null), card(null)]);
    expect(out).toContain("No epic");
    expect(out).toContain("?epic=none&amp;sprint=all");
  });

  it("hides archived epics until the toggle asks for them", () => {
    const epics = [epic("e1", "Live"), epic("e2", "Gone", { status: "archived" })];
    expect(render(epics, [card("e1")])).not.toContain("Gone");
    expect(render(epics, [card("e1")])).toContain("Show archived");
    expect(render(epics, [card("e1")], true, { archived: "1" })).toContain("Gone");
  });

  it("offers the New epic form only to someone who may manage the board", () => {
    expect(render([epic("e1", "Commerce")], [card("e1")], true)).toContain("New epic");
    expect(render([epic("e1", "Commerce")], [card("e1")], false)).not.toContain("New epic");
  });

  it("says what an epic is for when the board has none", () => {
    expect(render([], [])).toContain("An epic groups this board");
  });

  it("names no person: the figures are cards and tokens", () => {
    const out = render([epic("e1", "Commerce")], [card("e1")]);
    expect(out).not.toMatch(/assignee|owner_id|moved_by/i);
  });
});

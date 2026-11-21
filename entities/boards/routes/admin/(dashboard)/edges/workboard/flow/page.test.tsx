import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Work Analytics (AH.7): one sentence of what is stuck, the cards behind each
// figure, boards ranked by what is stuck, and the boards with no open work
// folded into one line.
const flow = vi.fn();
vi.mock("@/entities/boards/lib/flow-metrics", () => ({ loadFlow: () => flow(), STUCK_IN_COLUMN_DAYS: 30 }));
vi.mock("@/entities/boards/lib/actions", () => ({ updateCard: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// The page asks for its declared permission first (ADR 0013); the guard is
// tested on its own, so here it only records what was asked.
const asked: string[] = [];
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: async (p: string) => void asked.push(p) }));

import WorkboardFlowPage from "./page";

const board = (id: string, open: number, overdue: number, blocked: number) => ({ id, name: `Board ${id}`, slug: id, client: true, clientCompanyId: null, open, done: 1, blocked, overdue, oldestDays: 10, columns: [] });
const stuck = (id: string, o: { blocked?: boolean; lateDays?: number; daysInColumn?: number }) => ({
  id, title: `Card ${id}`, boardName: "Board a", boardSlug: "a", column: "To do", due: "2026-11-01", blocked: false, lateDays: 0, daysInColumn: 3, ...o,
});
const metrics = {
  open: 12, done: 4, boards: 3, blocked: 1, overdue: 1, noDueDate: 0,
  perBoard: [board("small", 2, 0, 0), board("big", 10, 1, 1), board("idle", 0, 0, 0)],
  agingInColumn: [], weekly: [{ week: "2026-11-01", label: "11-01", created: 3, completed: 1 }],
  stuck: [stuck("x", { blocked: true }), stuck("y", { lateDays: 4 }), stuck("z", { daysInColumn: 45 })],
};
const render = async (show?: string) => {
  flow.mockResolvedValueOnce(metrics);
  return renderToStaticMarkup(await WorkboardFlowPage({ searchParams: Promise.resolve(show ? { show } : {}) }));
};

describe("Work Analytics", () => {
  it("says how much is stuck in one sentence, under the new name", async () => {
    const html = await render();
    expect(asked).toContain("boards.open");
    expect(html).toContain("Work Analytics");
    expect(html).toContain("12 open cards across 2 boards. 1 late, 1 blocked, and 1 sat in one column for over a month.");
  });

  it("lists the stuck cards, and a filter narrows them to the cards behind its figure", async () => {
    const all = await render();
    expect(["Card x", "Card y", "Card z"].every((t) => all.includes(t))).toBe(true);
    const late = await render("late");
    expect(late).toContain("Card y");
    expect(late).not.toContain("Card x");
  });

  it("ranks boards by what is stuck, not by size, and folds the idle ones", async () => {
    const html = await render();
    expect(html.indexOf("Board big")).toBeLessThan(html.indexOf("Board small"));
    expect(html).toContain("1 board with no open work: Board idle.");
  });
});

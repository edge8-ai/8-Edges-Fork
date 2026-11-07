import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// W.113 / W.134. Flow's Overdue figure is the error red every other surface
// uses for overdue, and a zero is plain ink rather than a tone it has not earned.
const flow = vi.fn();
vi.mock("@/entities/boards/lib/flow-metrics", () => ({ loadFlow: () => flow() }));
// The page asks for its declared permission first (ADR 0013); the guard is
// tested on its own, so here it only records what was asked.
const asked: string[] = [];
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: async (p: string) => void asked.push(p) }));

import WorkboardFlowPage from "./page";

const metrics = (overdue: number, blocked: number) => ({
  open: 10, done: 4, boards: 2, blocked, overdue, noDueDate: 1,
  perBoard: [], agingInColumn: [], weekly: [{ week: "2026-W38", created: 1, completed: 1 }],
});
const render = async (overdue: number, blocked = 0) => {
  flow.mockResolvedValueOnce(metrics(overdue, blocked));
  return renderToStaticMarkup(await WorkboardFlowPage());
};
const tile = (html: string, label: string) => html.slice(html.indexOf(label), html.indexOf(label) + 400);

describe("the Flow page's counts", () => {
  it("paints a non-zero Overdue in the error red", async () => {
    expect(tile(await render(5), "Overdue")).toContain('<span class="u-err">5</span>');
  });

  it("leaves a zero Overdue in plain ink", async () => {
    expect(tile(await render(0), "Overdue")).not.toContain("u-err");
  });
});

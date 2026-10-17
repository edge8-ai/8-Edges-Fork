import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

// W.133. The late-date offer's two flows, driven without a DOM: the component
// functions are called directly with useState replaced by numbered slots (as
// React keeps them), and the handlers are taken off the returned elements.
//   · the offer appears only for a commit that LANDED, never a refused one;
//   · a write that throws frees the buttons and says so.

const slots: unknown[] = [];
let cursor = 0;
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  // The panel's imports reach session readers wrapped in React's `cache`,
  // which the React vitest resolves lacks.
  cache: <T,>(fn: T) => fn,
  useState: (init: unknown) => {
    const i = cursor++;
    if (!(i in slots)) slots[i] = typeof init === "function" ? (init as () => unknown)() : init;
    return [slots[i], (next: unknown) => { slots[i] = typeof next === "function" ? (next as (p: unknown) => unknown)(slots[i]) : next; }];
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const updateCard = vi.fn();
vi.mock("@/entities/boards/lib/actions", () => ({ updateCard: (...a: unknown[]) => updateCard(...a) }));

import { SprintPlanningLateOffer } from "./SprintPlanningLateOffer";
import { SprintPlanningPanel, type PanelCard } from "./SprintPlanningPanel";

/** Every element in a returned tree, depth first. */
function elements(node: ReactNode): ReactElement[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  const el = node as ReactElement<{ children?: ReactNode }>;
  return [el, ...elements(el.props?.children)];
}
const text = (node: ReactNode): string =>
  typeof node === "string" || typeof node === "number" ? String(node) : Array.isArray(node) ? node.map(text).join("") : node && typeof node === "object" ? text((node as ReactElement<{ children?: ReactNode }>).props?.children) : "";

beforeEach(() => {
  slots.length = 0;
  updateCard.mockReset();
});

describe("the late-date offer's write", () => {
  const props = {
    cards: [{ id: "c1", title: "Late one", due_date: "2026-09-22" }],
    sprint: { name: "Sprint 12", starts_on: "2026-09-30", ends_on: null },
    boardSlug: "b",
    onClose: vi.fn(),
  };
  const render = () => {
    cursor = 0;
    return SprintPlanningLateOffer(props);
  };

  it("frees the buttons and shows an error when the write throws", async () => {
    updateCard.mockRejectedValueOnce(new Error("network down"));
    const move = elements(render()).find((e) => e.type === "button" && text(e).startsWith("Move to"))!;
    await (move.props as { onClick: () => Promise<void> }).onClick();
    const [busy, error] = slots;
    expect(busy).toBe(false);
    expect(error).toBe("network down");
    expect(props.onClose).not.toHaveBeenCalled();
    expect(text(render())).toContain("network down");
  });
});

describe("the late-date offer's write, when it holds", () => {
  it("moves each card's due date to the sprint's first day through updateCard, then closes", async () => {
    updateCard.mockResolvedValue({ ok: true });
    const onClose = vi.fn();
    cursor = 0;
    const tree = SprintPlanningLateOffer({
      cards: [{ id: "c1", title: "One", due_date: "2026-09-22" }, { id: "c2", title: "Two", due_date: "2026-09-25" }],
      sprint: { name: "Sprint 12", starts_on: "2026-09-30", ends_on: "2026-10-06" },
      boardSlug: "b",
      onClose,
    });
    const first = elements(tree).find((e) => e.type === "button" && text(e) === "Move to Sep 30, 2026")!;
    await (first.props as { onClick: () => Promise<void> }).onClick();
    expect(updateCard.mock.calls).toEqual([
      ["c1", { dueDate: "2026-09-30" }, "b"],
      ["c2", { dueDate: "2026-09-30" }, "b"],
    ]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // A.33: the offer re-dates through runBulk, so one card's refusal no longer
  // abandons the rest, and the person reads one sentence about what refused.
  it("re-dates the other cards when one refuses, and says which part refused", async () => {
    updateCard.mockResolvedValueOnce({ ok: false, error: "That card is archived." }).mockResolvedValueOnce({ ok: true });
    const onClose = vi.fn();
    cursor = 0;
    const tree = SprintPlanningLateOffer({
      cards: [{ id: "c1", title: "One", due_date: "2026-09-22" }, { id: "c2", title: "Two", due_date: "2026-09-25" }],
      sprint: { name: "Sprint 12", starts_on: "2026-09-30", ends_on: "2026-10-06" },
      boardSlug: "b",
      onClose,
    });
    const first = elements(tree).find((e) => e.type === "button" && text(e) === "Move to Sep 30, 2026")!;
    await (first.props as { onClick: () => Promise<void> }).onClick();
    expect(updateCard.mock.calls.map((c) => c[0])).toEqual(["c1", "c2"]);
    expect(slots[1]).toBe("Re-dated 1 card; 1 refused: That card is archived.");
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("the panel's commit and the offer", () => {
  const board = { id: "b1", name: "Delivery", slug: "delivery", client_company_id: "c1", client_name: "Acme", client_color: 1, columns: [{ id: "col-done", name: "Done", is_done: true }] };
  const pb = { board, chat: "product", next: { id: "s2", name: "Sprint 12", goal: null, week: "2026-W40", locked_at: null, starts_on: "2026-09-30", ends_on: "2026-10-06" }, ending: [] };
  const late = { id: "c1", title: "Late one", columnId: "open", board_id: "b1", status: "open", priority: "p3", sprint_id: "s1", epic_id: null, created_at: "2026-06-01", last_moved_at: "2026-06-01", completed_at: null, due_date: "2026-09-22", assignee_id: null, assignee_name: null, human_tokens: null, internal: false, agent: false, subject_type: null, subtasks: [], blockers: [], comments: [] } as unknown as PanelCard;
  const landed: Array<(() => void) | undefined> = [];
  const move = vi.fn((_id: string, _to: string, onLanded?: () => void) => void landed.push(onLanded));
  const render = () => {
    cursor = 0;
    return SprintPlanningPanel({
      pb: pb as never,
      cards: [late],
      sprintName: new Map(),
      epicById: new Map(),
      carriedSprints: {},
      section: "/admin",
      canEdit: true,
      pending: false,
      move,
      saving: false,
      quickAdd: () => {},
      openDrawer: () => {},
      canAdd: true,
      onOpenCard: () => {},
      onArchiveCard: () => {},
    });
  };
  const offerShown = () => elements(render()).some((e) => e.type === SprintPlanningLateOffer);

  beforeEach(() => {
    landed.length = 0;
    move.mockClear();
  });

  it("offers a new date only once the commit has landed", () => {
    const kanban = elements(render()).find((e) => typeof (e.props as { onMove?: unknown }).onMove === "function")!;
    (kanban.props as { onMove: (id: string, to: string) => void }).onMove("c1", "next");
    expect(move).toHaveBeenCalledWith("c1", "next", expect.any(Function));
    expect(offerShown()).toBe(false);
    landed[0]!();
    expect(offerShown()).toBe(true);
  });

  it("offers nothing for a commit that was refused or failed", () => {
    const kanban = elements(render()).find((e) => typeof (e.props as { onMove?: unknown }).onMove === "function")!;
    (kanban.props as { onMove: (id: string, to: string) => void }).onMove("c1", "next");
    // The page never calls onLanded for a refused or failed move.
    expect(offerShown()).toBe(false);
  });
});

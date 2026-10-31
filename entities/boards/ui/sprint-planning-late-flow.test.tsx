import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

// W.133. The late-date offer's two flows, driven without a DOM: the component
// and hook functions are called directly with useState replaced by numbered
// slots (as React keeps them), and the handlers are taken off the returned
// elements.
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
// The synced state's own contract is tested where it lives; here the write runs
// straight through, and the test awaits it.
const synced: { run: (write: () => Promise<{ ok: boolean; error?: string }>, handlers?: { onError?: (m: string) => void }) => Promise<unknown> } = { run: async () => undefined };
vi.mock("@/kernel/ui/hooks/useServerSyncedState", () => ({
  useServerSyncedState: (v: unknown) => [v, () => {}, { pending: 0, run: (w: never, h: never) => synced.run(w, h) }],
}));

import { SprintPlanningLateOffer } from "./SprintPlanningLateOffer";
import { useSprintPlanningMoves, type PlanningCard, type PlanningWrites } from "./useSprintPlanningMoves";

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

// The offer now follows the page's one move path (W.202), so its W.133
// contract is pinned on the moves hook: a card joins the offer only once its
// commit has landed, for a single arrow and for a selection alike.
describe("a commit and the offer", () => {
  const board = { id: "b1", name: "Delivery", slug: "delivery", client_company_id: "c1", client_name: "Acme", client_color: 1, columns: [{ id: "col-done", name: "Done", is_done: true }] };
  const pb = { board, chat: "product", next: { id: "s2", name: "Sprint 12", goal: null, week: "2026-W40", locked_at: null, starts_on: "2026-09-30", ends_on: "2026-10-06" }, ending: [] };
  const card = (id: string, due_date: string | null) =>
    ({ id, title: id, columnId: "open", pb, board_id: "b1", status: "open", priority: "p3", sprint_id: "s1", epic_id: null, created_at: "2026-06-01", last_moved_at: "2026-06-01", completed_at: null, due_date, assignee_id: null, assignee_name: null, human_tokens: null, internal: false, agent: false, subject_type: null, subtasks: [], blockers: [], comments: [] }) as unknown as PlanningCard;
  const banner: (string | null)[] = [];
  let running: Promise<unknown> = Promise.resolve();

  const useMoves = (setSprint: PlanningWrites["setSprint"]) => {
    cursor = 0;
    return useSprintPlanningMoves({ serverPlacement: {}, today: "2026-09-29", setBanner: (m) => void banner.push(m), writes: { setSprint, moveColumn: vi.fn() } });
  };

  beforeEach(() => {
    banner.length = 0;
    synced.run = (write, handlers) => {
      running = write().then((r) => {
        if (!r.ok) handlers?.onError?.(r.error ?? "");
        return r;
      });
      return running as never;
    };
  });

  it("offers a new date only once the commit has landed", async () => {
    const late = card("late", "2026-09-22");
    useMoves(async () => ({ ok: true })).apply(["late"], "next", [late]);
    await running;
    expect(useMoves(vi.fn()).late.b1?.map((c) => c.id)).toEqual(["late"]);
  });

  it("offers nothing for a commit that was refused, and says why", async () => {
    useMoves(async () => ({ ok: false, error: "Sprint 12 is locked." })).apply(["late"], "next", [card("late", "2026-09-22")]);
    await running;
    expect(useMoves(vi.fn()).late.b1 ?? []).toEqual([]);
    expect(banner.at(-1)).toBe("Couldn't move card: Sprint 12 is locked.");
  });

  // W.202.4: a selection commits each card in turn, offers only the ones that
  // landed, and reports what refused in one sentence.
  it("commits a selection one card at a time and offers only the late cards that landed", async () => {
    const setSprint = vi.fn(async (id: string) => (id === "b" ? { ok: false as const, error: "That card is archived." } : { ok: true as const }));
    useMoves(setSprint).apply(["a", "b", "c"], "next", [card("a", "2026-09-22"), card("b", "2026-09-22"), card("c", null)]);
    await running;
    expect(setSprint.mock.calls.map((c) => c[0])).toEqual(["a", "b", "c"]);
    expect(useMoves(vi.fn()).late.b1?.map((c) => c.id)).toEqual(["a"]);
    expect(banner.at(-1)).toBe("Committed 2 cards; 1 refused: That card is archived.");
  });
});

// Review of W.202, (a)1: the lock refuses changing what a sprint commits to,
// never closing committed work. A committed card goes to Done through the
// board's own column move; taking it out of the sprint is refused with the
// sentence that says where Unlock is, and nothing reaches the server.
describe("a move on a locked sprint", () => {
  const board = { id: "b1", name: "Delivery", slug: "delivery", columns: [{ id: "col-done", name: "Done", is_done: true }] };
  const pb = { board, chat: "product", next: { id: "s2", name: "Sprint 12", week: "2026-W40", locked_at: "2026-09-29T03:00:00Z", starts_on: "2026-09-30", ends_on: "2026-10-06" }, ending: [] };
  const committed = { id: "n1", title: "n1", columnId: "next", pb, board_id: "b1", status: "open", sprint_id: "s2", due_date: null } as unknown as PlanningCard;
  const banner: (string | null)[] = [];
  let running: Promise<unknown> = Promise.resolve();
  const setSprint = vi.fn(async () => ({ ok: true as const }));
  const moveColumn = vi.fn(async () => ({ ok: true as const }));
  const useMoves = () => {
    cursor = 0;
    return useSprintPlanningMoves({ serverPlacement: {}, today: "2026-09-29", setBanner: (m) => void banner.push(m), writes: { setSprint, moveColumn } });
  };

  beforeEach(() => {
    banner.length = 0;
    setSprint.mockClear();
    moveColumn.mockClear();
    synced.run = (write) => (running = write());
  });

  it("closes a committed card into the board's Done column", async () => {
    useMoves().apply(["n1"], "done", [committed]);
    await running;
    expect(moveColumn).toHaveBeenCalledWith("n1", "col-done", "delivery");
    expect(banner.at(-1)).toBeNull();
  });

  it("refuses taking it back to Not done, says where Unlock is, and asks the server nothing", () => {
    useMoves().apply(["n1"], "open", [committed]);
    expect(setSprint).not.toHaveBeenCalled();
    expect(banner.at(-1)).toBe("Sprint 12 is locked. Unlock it above to change what is committed.");
  });
});

// W.203: a closed next sprint takes no card, so the move is refused on the
// page with the same sentence the server would give, and the server is not asked.
describe("a commit to a closed next sprint", () => {
  const board = { id: "b1", name: "Delivery", slug: "delivery", columns: [{ id: "col-done", name: "Done", is_done: true }] };
  const pb = { board, chat: "product", next: { id: "s2", name: "Sprint 12", status: "closed", week: "2026-W40", locked_at: null, starts_on: "2026-09-30", ends_on: "2026-10-06" }, ending: [] };
  const open = { id: "o1", title: "o1", columnId: "open", pb, board_id: "b1", status: "open", sprint_id: null, due_date: null } as unknown as PlanningCard;
  const banner: (string | null)[] = [];
  const setSprint = vi.fn(async () => ({ ok: true as const }));

  it("refuses it without asking the server", () => {
    cursor = 0;
    useSprintPlanningMoves({ serverPlacement: {}, today: "2026-10-01", setBanner: (m) => void banner.push(m), writes: { setSprint, moveColumn: vi.fn() } }).apply(["o1"], "next", [open]);
    expect(setSprint).not.toHaveBeenCalled();
    expect(banner.at(-1)).toBe("Sprint 12 is closed. Pick an open sprint.");
  });
});

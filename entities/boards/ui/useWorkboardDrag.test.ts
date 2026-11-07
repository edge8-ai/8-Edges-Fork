import { beforeEach, describe, expect, it, vi } from "vitest";
import { runSyncedWrite } from "@/kernel/ui/hooks/settle-write";
import type { SyncedRun } from "@/kernel/ui/hooks/useServerSyncedState";
import type { MoveCard } from "@/entities/boards/lib/types";
import type { WorkboardBoard, WorkboardData } from "@/entities/boards/lib/workboard";

// A.54. What the board does with a move the server took but could not finish
// ("Card moved, but the stage history could not be written"), pinned at the
// hook. The environment has no DOM, so React's hooks are replaced by numbered
// slots in call order, as React keeps them, and a render is calling the hook
// again. The write runs through the real runSyncedWrite, so the rollback the
// board would ask for is counted rather than assumed.

const slots: unknown[] = [];
let cursor = 0;
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (init: unknown) => {
    const i = cursor++;
    if (!(i in slots)) slots[i] = typeof init === "function" ? (init as () => unknown)() : init;
    return [
      slots[i],
      (next: unknown) => {
        slots[i] = typeof next === "function" ? (next as (prev: unknown) => unknown)(slots[i]) : next;
      },
    ];
  },
  useRef: (init: unknown) => {
    const i = cursor++;
    if (!(i in slots)) slots[i] = { current: init };
    return slots[i];
  },
  useEffect: () => undefined,
  useMemo: (fn: () => unknown) => fn(),
  useCallback: (fn: unknown) => fn,
}));
const showMoveUndo = vi.fn();
vi.mock("./undo-toast", () => ({ showMoveUndo: (...args: unknown[]) => showMoveUndo(...args) }));
vi.mock("@/entities/boards/lib/reorder-actions", () => ({ reorderCard: vi.fn(async () => ({ ok: true })) }));

// Renamed so the hooks lint reads the calls below as the stand-in renders they are.
const { useWorkboardDrag: workboardDrag } = await import("./useWorkboardDrag");

const card = { id: "c1", board_id: "b1", laneId: "todo", columnId: "todo", title: "Write the spec", subject_type: null, assignee_id: null };
const data = (laneId: string) =>
  ({
    cards: [{ ...card, laneId, columnId: laneId }],
    lanes: [
      { id: "todo", name: "To do", isDone: false },
      { id: "done", name: "Done", isDone: true },
    ],
  }) as unknown as WorkboardData;
const board = { id: "b1", slug: "eight-edges", name: "Edge8", laneColumn: { todo: "col-todo", done: "col-done" } } as unknown as WorkboardBoard;

let placement: Record<string, string> = {};
const setPlacement = vi.fn((fn: (p: Record<string, string>) => Record<string, string>) => {
  placement = fn(placement);
});
const bracket = { begin: vi.fn(), end: vi.fn(), rollback: vi.fn() };
const run: SyncedRun = (write, handlers = {}) => runSyncedWrite(write, handlers, bracket);
const onMove = vi.fn<MoveCard>();

function render(laneId = "todo") {
  cursor = 0;
  const d = data(laneId);
  return workboardDrag({
    data: d,
    cards: d.cards as never,
    boardById: new Map([["b1", board]]),
    single: board,
    onMove,
    placement,
    setPlacement,
    run,
    setBanner: vi.fn(),
    viewerPersonId: null,
  });
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  slots.length = 0;
  placement = {};
  vi.clearAllMocks();
});

describe("a move the server took but could not finish (A.54)", () => {
  const tookBut = { ok: false as const, persisted: true as const, error: "Card moved, but the stage history could not be written: timeout" };

  it("keeps the card where it was dropped and puts the message on it as a warning", async () => {
    onMove.mockResolvedValueOnce(tookBut);
    render().move("c1", "done");
    await settle();

    expect(onMove).toHaveBeenCalledWith("c1", "col-done", "eight-edges");
    expect(placement.c1).toBe("done");
    // The row moved and the action revalidated, so nothing is asked again.
    expect(bracket.rollback).not.toHaveBeenCalled();
    expect(render().moveState.failures.c1).toEqual({ message: tookBut.error, laneId: "done", kind: "warning" });
    // No Undo and no flourish: those belong to a move that went through whole.
    expect(showMoveUndo).not.toHaveBeenCalled();
    expect(render().moveState.completedCard).toBeNull();
  });

  // The move's own action finds the card already in the lane and does
  // nothing, so a Retry could never clear the message; Dismiss does.
  it("offers nothing to retry, and lets the person dismiss the message", async () => {
    onMove.mockResolvedValueOnce(tookBut);
    render().move("c1", "done");
    await settle();

    render().moveState.retry("c1");
    await settle();
    expect(onMove).toHaveBeenCalledTimes(1);
    render().moveState.dismiss("c1");
    expect(render().moveState.failures.c1).toBeUndefined();
  });

  // The reported picture, confirmed here rather than in a browser: the
  // board's next render (the action's own response) has the card in the lane
  // it moved to, and the message stays with it until it is dismissed. Before
  // A.54 that message was a refusal whose snap-back the render overturned.
  it("still shows the card in its new lane, with the warning, after the server's next render", async () => {
    onMove.mockResolvedValueOnce(tookBut);
    render().move("c1", "done");
    await settle();

    placement = {};
    expect(render("done").moveState.failures.c1?.kind).toBe("warning");
  });
});

describe("a move the server refused", () => {
  it("sends the card back, asks the server again, and offers Retry", async () => {
    onMove.mockResolvedValueOnce({ ok: false, error: "That column is not on this board." });
    render().move("c1", "done");
    await settle();

    expect(placement.c1).toBe("todo");
    expect(bracket.rollback).toHaveBeenCalledOnce();
    expect(render().moveState.failures.c1).toEqual({ message: "That column is not on this board.", laneId: "done", kind: "refused" });

    onMove.mockResolvedValueOnce({ ok: true });
    render().moveState.retry("c1");
    await settle();
    expect(onMove).toHaveBeenCalledTimes(2);
    expect(placement.c1).toBe("done");
    expect(render().moveState.failures.c1).toBeUndefined();
  });
});

describe("a move the server took", () => {
  it("lands the card, offers the Undo and leaves no message", async () => {
    onMove.mockResolvedValueOnce({ ok: true });
    render().move("c1", "done");
    await settle();

    expect(placement.c1).toBe("done");
    expect(bracket.rollback).not.toHaveBeenCalled();
    expect(showMoveUndo).toHaveBeenCalledOnce();
    expect(render().moveState.failures).toEqual({});
  });
});

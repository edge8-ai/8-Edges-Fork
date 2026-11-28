import { beforeEach, describe, expect, it, vi } from "vitest";

// Every move on the planning page, driven without a DOM: the hook function is
// called directly with useState replaced by numbered slots (as React keeps
// them), and the write runs straight through so the test can await it.
//   · a card the ended sprint did not finish can be sent to the backlog, and
//     is carried no longer the moment it is sent (W.207.3);
//   · a refused write puts it back and says why;
//   · committing, taking out and closing keep their own refusals.

const slots: unknown[] = [];
let cursor = 0;
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T,>(fn: T) => fn,
  useState: (init: unknown) => {
    const i = cursor++;
    if (!(i in slots)) slots[i] = typeof init === "function" ? (init as () => unknown)() : init;
    return [slots[i], (next: unknown) => { slots[i] = typeof next === "function" ? (next as (p: unknown) => unknown)(slots[i]) : next; }];
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const synced: { run: (write: () => Promise<{ ok: boolean; error?: string }>, handlers?: { onError?: (m: string) => void }) => Promise<unknown> } = { run: async () => undefined };
vi.mock("@/kernel/ui/hooks/useServerSyncedState", () => ({
  useServerSyncedState: (v: unknown) => [v, () => {}, { pending: 0, run: (w: never, h: never) => synced.run(w, h) }],
}));

import { useSprintPlanningMoves, type PlanningCard, type PlanningWrites } from "./useSprintPlanningMoves";

const board = { id: "b1", name: "Delivery", slug: "delivery", columns: [{ id: "col-done", name: "Done", is_done: true }] };
const planning = (status?: string) => ({ board, chat: "product", next: { id: "s2", name: "Sprint 12", status, week: "2026-W40", starts_on: "2026-09-30", ends_on: "2026-10-06" }, ending: [] });
const card = (id: string, columnId: string, sprint_id: string | null, pb = planning()) =>
  ({ id, title: id, columnId, pb, board_id: "b1", status: "open", sprint_id, due_date: null }) as unknown as PlanningCard;

const banner: (string | null)[] = [];
let running: Promise<unknown> = Promise.resolve();
const moveColumn = vi.fn(async () => ({ ok: true as const }));

// Each call is one render, so the slot cursor rewinds first, as React's does.
// The rewind lives outside the hook-named helper so the hook itself never
// reassigns module state (react-hooks/globals).
const rewind = () => {
  cursor = 0;
};

const useMoves = (setSprint: PlanningWrites["setSprint"]) => {
  rewind();
  return useSprintPlanningMoves({ serverPlacement: {}, setBanner: (m) => void banner.push(m), writes: { setSprint, moveColumn } });
};

beforeEach(() => {
  slots.length = 0;
  banner.length = 0;
  moveColumn.mockClear();
  synced.run = (write, handlers) => {
    running = write().then((r) => {
      if (!r.ok) handlers?.onError?.(r.error ?? "");
      return r;
    });
    return running as never;
  };
});

describe("sending a carried card to the backlog (W.207.3)", () => {
  it("takes the card out of its sprint, and it reads as backlog at once", async () => {
    const setSprint = vi.fn(async () => ({ ok: true as const }));
    useMoves(setSprint).apply(["a"], "backlog", [card("a", "open", "s1")]);
    expect(useMoves(vi.fn()).sent.has("a")).toBe(true);
    await running;
    expect(setSprint).toHaveBeenCalledWith("a", null, "delivery");
    expect(banner.at(-1)).toBeNull();
    expect(useMoves(vi.fn()).sent.has("a")).toBe(true);
  });

  it("puts the card back as carried and says why when the write is refused", async () => {
    useMoves(async () => ({ ok: false, error: "That card is archived." })).apply(["a"], "backlog", [card("a", "open", "s1")]);
    await running;
    expect(useMoves(vi.fn()).sent.has("a")).toBe(false);
    expect(banner.at(-1)).toBe("Couldn't move card: That card is archived.");
  });

  it("asks the server nothing for a card that is already backlog", () => {
    const setSprint = vi.fn(async () => ({ ok: true as const }));
    useMoves(setSprint).apply(["a"], "backlog", [card("a", "open", null)]);
    expect(setSprint).not.toHaveBeenCalled();
  });

  it("sends a selection one card at a time and reports what refused in one sentence", async () => {
    const setSprint = vi.fn(async (id: string) => (id === "b" ? { ok: false as const, error: "That card is archived." } : { ok: true as const }));
    useMoves(setSprint).apply(["a", "b", "c"], "backlog", [card("a", "open", "s1"), card("b", "open", "s1"), card("c", "open", "s1")]);
    await running;
    expect(setSprint.mock.calls.map((c) => c[0])).toEqual(["a", "b", "c"]);
    expect([...useMoves(vi.fn()).sent].sort()).toEqual(["a", "c"]);
    expect(banner.at(-1)).toBe("Sent to the backlog 2 cards; 1 refused: That card is archived.");
  });

  it("works when the board has no next sprint to commit to", async () => {
    const setSprint = vi.fn(async () => ({ ok: true as const }));
    useMoves(setSprint).apply(["a"], "backlog", [card("a", "open", "s1", { ...planning(), next: null } as never)]);
    await running;
    expect(setSprint).toHaveBeenCalledWith("a", null, "delivery");
  });
});

describe("the other moves", () => {
  it("commits a card into the next sprint, as long as it is not closed", async () => {
    const setSprint = vi.fn(async () => ({ ok: true as const }));
    useMoves(setSprint).apply(["a"], "next", [card("a", "open", null)]);
    await running;
    expect(setSprint).toHaveBeenCalledWith("a", "s2", "delivery");
  });

  it("refuses a commit to a closed next sprint without asking the server", () => {
    const setSprint = vi.fn(async () => ({ ok: true as const }));
    useMoves(setSprint).apply(["a"], "next", [card("a", "open", null, planning("closed"))]);
    expect(setSprint).not.toHaveBeenCalled();
    expect(banner.at(-1)).toBe("Sprint 12 is closed. Pick an open sprint.");
  });

  it("takes a committed card out of the next sprint", async () => {
    const setSprint = vi.fn(async () => ({ ok: true as const }));
    useMoves(setSprint).apply(["n1"], "open", [card("n1", "next", "s2")]);
    await running;
    expect(setSprint).toHaveBeenCalledWith("n1", null, "delivery");
  });

  it("closes a committed card into the board's Done column", async () => {
    useMoves(vi.fn()).apply(["n1"], "done", [card("n1", "next", "s2")]);
    await running;
    expect(moveColumn).toHaveBeenCalledWith("n1", "col-done", "delivery");
    expect(banner.at(-1)).toBeNull();
  });

  it("commits a selection one card at a time and reports what refused in one sentence", async () => {
    const setSprint = vi.fn(async (id: string) => (id === "b" ? { ok: false as const, error: "That card is archived." } : { ok: true as const }));
    useMoves(setSprint).apply(["a", "b", "c"], "next", [card("a", "open", "s1"), card("b", "open", "s1"), card("c", "open", null)]);
    await running;
    expect(setSprint.mock.calls.map((c) => c[0])).toEqual(["a", "b", "c"]);
    expect(banner.at(-1)).toBe("Committed 2 cards; 1 refused: That card is archived.");
  });
});

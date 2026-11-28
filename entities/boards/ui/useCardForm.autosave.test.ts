import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// TH.3.2: a saved card's drawer saves on its own. Pinned at the hook, through
// the setter the drawer is handed, with the same stand-in for React as
// useCardForm.test.ts: useState and useRef are numbered slots in call order,
// an effect runs as the render happens, and a render that sets state renders
// again. Each edit is followed by a render, as React commits one before any
// timer can fire.

const slots: unknown[] = [];
let cursor = 0;
let setDuringRender = false;
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (init: unknown) => {
    const i = cursor++;
    if (!(i in slots)) slots[i] = typeof init === "function" ? (init as () => unknown)() : init;
    return [
      slots[i],
      (next: unknown) => {
        slots[i] = typeof next === "function" ? (next as (prev: unknown) => unknown)(slots[i]) : next;
        setDuringRender = true;
      },
    ];
  },
  useRef: (init: unknown) => {
    const i = cursor++;
    if (!(i in slots)) slots[i] = { current: init };
    return slots[i];
  },
  // Cleanups are kept, so a test can rehearse an unmount as StrictMode does.
  useEffect: (fn: () => unknown) => {
    const cleanup = fn();
    if (typeof cleanup === "function") cleanups.push(cleanup as () => void);
  },
}));
const cleanups: (() => void)[] = [];
type Outcome = { ok: boolean; error?: string; id?: string };
const updateCard = vi.fn(async (..._args: unknown[]): Promise<Outcome> => ({ ok: true }));
const createCard = vi.fn(async (..._args: unknown[]): Promise<Outcome> => ({ ok: true, id: "new-1" }));
const setCardSprint = vi.fn(async (..._args: unknown[]): Promise<Outcome> => ({ ok: true }));
vi.mock("@/entities/boards/lib/actions", () => ({
  updateCard: (...args: unknown[]) => updateCard(...args),
  createCard: (...args: unknown[]) => createCard(...args),
  archiveCard: vi.fn(),
  setCardInternal: vi.fn(async () => ({ ok: true })),
  setCardRoadmapItem: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/entities/boards/lib/sprint-actions", () => ({ setCardSprint: (...args: unknown[]) => setCardSprint(...args) }));
const setCardEpic = vi.fn(async (..._args: unknown[]): Promise<Outcome> => ({ ok: true }));
vi.mock("@/entities/boards/lib/epic-actions", () => ({ setCardEpic: (...args: unknown[]) => setCardEpic(...args) }));
vi.mock("./new-card-deliverables", () => ({ handPendingToNewCard: vi.fn(async () => null) }));

import { useCardForm as cardForm } from "./useCardForm";
import { HANDOVER_WAIT_MS, PICK_DELAY_MS, TYPING_DELAY_MS } from "./card-autosave";
import type { Form } from "./board-view-types";

const board = { id: "b1", slug: "b", name: "B", client_company_id: null, laneColumn: { "To do": "col-1" } };
const card = (patch: Record<string, unknown> = {}) =>
  ({
    id: "c1",
    board_id: "b1",
    columnId: "To do",
    laneId: "To do",
    title: "Old",
    priority: "p3",
    assignee_id: null,
    due_date: null,
    human_tokens: 1,
    description: "",
    metadata: {},
    sprint_id: null,
    epic_id: null,
    subject_type: null,
    subject_label: null,
    subject_id: null,
    internal: false,
    subtasks: [],
    ...patch,
  }) as never;
const dataWith = (c: unknown) =>
  ({ boards: [board], cards: Array.isArray(c) ? c : [c], lanes: [{ id: "To do" }], sprints: [], epics: [] }) as never;
const formNow = () => slots[0] as Form | null;

let banner: string | null = null;
const refresh = vi.fn();
/** The hook as the board renders it while the server's copy of the card is `now`. */
function hook(now: unknown = card()) {
  const render = () =>
    cardForm({
      data: dataWith(now),
      sprintFilter: "all",
      epicFilter: [],
      setBanner: (m: string | null) => {
        banner = m;
      },
      router: { refresh } as never,
      startSaving: ((fn: () => Promise<void>) => void fn()) as never,
      run: vi.fn(),
      viewerPersonId: "me",
    });
  let h!: ReturnType<typeof render>;
  for (let i = 0; i < 5; i++) {
    cursor = 0;
    setDuringRender = false;
    h = render();
    if (!setDuringRender) break;
  }
  return h;
}
/** The person changes the open card through the drawer's setter, and React commits. */
function change(fn: (f: Form) => Form, now: unknown = card()) {
  hook(now).setForm((f) => (f ? fn(f) : f));
  return hook(now);
}
const settle = async (ms: number) => {
  await vi.advanceTimersByTimeAsync(ms);
};
const patchOf = (call: number) => updateCard.mock.calls[call][1];

beforeEach(() => {
  vi.useFakeTimers();
  cleanups.length = 0;
  slots.length = 0;
  cursor = 0;
  banner = null;
  updateCard.mockReset().mockImplementation(async () => ({ ok: true }));
  createCard.mockReset().mockImplementation(async () => ({ ok: true, id: "new-1" }));
  setCardSprint.mockReset().mockImplementation(async () => ({ ok: true }));
  setCardEpic.mockReset().mockImplementation(async () => ({ ok: true }));
  refresh.mockReset();
  hook().openCard(card());
});
afterEach(() => vi.useRealTimers());

describe("a saved card saves itself", () => {
  it("saves a pick on its own, sending only that field, and says Saving… until it lands", async () => {
    const h = change((f) => ({ ...f, priority: "p1" }));
    expect(h.autosave.state).toBe("saving");
    expect(updateCard).not.toHaveBeenCalled();
    await settle(PICK_DELAY_MS);
    expect(updateCard).toHaveBeenCalledTimes(1);
    expect(patchOf(0)).toEqual({ priority: "p1" });
    expect(hook(card({ priority: "p1" })).autosave.state).toBe("saved");
  });

  it("waits for a pause in typing and sends the last text once", async () => {
    change((f) => ({ ...f, description: "Half" }));
    await settle(TYPING_DELAY_MS - 200);
    change((f) => ({ ...f, description: "Half a thought" }));
    await settle(TYPING_DELAY_MS - 200);
    expect(updateCard).not.toHaveBeenCalled();
    await settle(200);
    expect(updateCard).toHaveBeenCalledTimes(1);
    expect(patchOf(0)).toEqual({ description: "Half a thought" });
  });

  it("does not save again what the server only trimmed", async () => {
    change((f) => ({ ...f, title: "Hello " }));
    await settle(TYPING_DELAY_MS);
    expect(patchOf(0)).toEqual({ title: "Hello " });
    // The board comes back with the trimmed title; nothing is left to send.
    hook(card({ title: "Hello" }));
    await settle(TYPING_DELAY_MS * 3);
    expect(updateCard).toHaveBeenCalledTimes(1);
  });

  it("saves an edit made while a save is running once that one finishes, and only that edit", async () => {
    let release!: (v: Outcome) => void;
    updateCard.mockImplementationOnce(() => new Promise<Outcome>((r) => (release = r)));
    change((f) => ({ ...f, priority: "p1" }));
    await settle(PICK_DELAY_MS);
    change((f) => ({ ...f, dueDate: "2026-10-12" }));
    await settle(PICK_DELAY_MS);
    expect(updateCard).toHaveBeenCalledTimes(1);
    release({ ok: true });
    await settle(PICK_DELAY_MS);
    expect(updateCard).toHaveBeenCalledTimes(2);
    expect(patchOf(1)).toEqual({ dueDate: "2026-10-12" });
  });

  it("does not start a save when the live card changes under the drawer", async () => {
    hook(card({ title: "Renamed elsewhere" }));
    await settle(TYPING_DELAY_MS * 2);
    expect(formNow()?.title).toBe("Renamed elsewhere");
    expect(updateCard).not.toHaveBeenCalled();
  });

  it("says Couldn't save when a write is refused, and Retry sends it again", async () => {
    updateCard.mockImplementationOnce(async () => ({ ok: false, error: "boom" }));
    change((f) => ({ ...f, priority: "p1" }));
    await settle(PICK_DELAY_MS);
    const h = hook();
    expect(h.autosave.state).toBe("failed");
    expect(banner).toBe("boom");
    h.autosave.retry();
    await settle(0);
    expect(updateCard).toHaveBeenCalledTimes(2);
    expect(patchOf(1)).toEqual({ priority: "p1" });
    expect(hook().autosave.state).toBe("saved");
  });

  // A.47: the epic step answered a refusal with the banner alone, so the board
  // kept showing an epic that was never saved.
  it("refreshes the board and says Couldn't save when the epic step is refused, like every other step", async () => {
    setCardEpic.mockImplementationOnce(async () => ({ ok: false, error: "epic refused" }));
    change((f) => ({ ...f, epicId: "epic-1" }));
    await settle(PICK_DELAY_MS);
    expect(setCardEpic).toHaveBeenCalledWith("c1", "epic-1", "b");
    expect(banner).toBe("epic refused");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(formNow()?.origEpicId).not.toBe("epic-1");
    expect(hook().autosave.state).toBe("failed");
  });

  it("never saves a new card on its own: that is Create card's", async () => {
    hook().openCreate("To do");
    change((f) => ({ ...f, title: "A new card" }));
    await settle(TYPING_DELAY_MS * 2);
    expect(createCard).not.toHaveBeenCalled();
    expect(updateCard).not.toHaveBeenCalled();
  });
});

// W.60: a handover's line rides in the message the reassignment sends.
describe("a handover", () => {
  it("waits while its line is being written and goes with the line when the box is left", async () => {
    change((f) => ({ ...f, assigneeId: "p2" }));
    hook().autosave.noteFocus(true);
    change((f) => ({ ...f, handoverNote: "Over to you" }));
    await settle(HANDOVER_WAIT_MS * 2);
    expect(updateCard).not.toHaveBeenCalled();
    hook().autosave.noteFocus(false);
    await settle(0);
    expect(patchOf(0)).toEqual({ assigneeId: "p2", handoverNote: "Over to you" });
    expect(formNow()).toMatchObject({ origAssigneeId: "p2", handoverNote: "" });
  });

  it("goes without a line once the wait runs out, if the box was never touched", async () => {
    change((f) => ({ ...f, assigneeId: "p2" }));
    await settle(HANDOVER_WAIT_MS - 100);
    expect(updateCard).not.toHaveBeenCalled();
    await settle(PICK_DELAY_MS);
    expect(patchOf(0)).toEqual({ assigneeId: "p2", handoverNote: "" });
  });

  it("does not hold up the other fields edited meanwhile", async () => {
    change((f) => ({ ...f, assigneeId: "p2" }));
    hook().autosave.noteFocus(true);
    change((f) => ({ ...f, priority: "p1" }));
    await settle(PICK_DELAY_MS);
    expect(patchOf(0)).toEqual({ priority: "p1" });
  });

  it("goes at once when the card is picked up by the person editing it", async () => {
    change((f) => ({ ...f, assigneeId: "me" }));
    await settle(PICK_DELAY_MS);
    expect(patchOf(0)).toEqual({ assigneeId: "me", handoverNote: "" });
  });

  it("goes, line and all, when the drawer closes before the box is left", async () => {
    change((f) => ({ ...f, assigneeId: "p2" }));
    hook().autosave.noteFocus(true);
    change((f) => ({ ...f, handoverNote: "Context" }));
    hook().close();
    await settle(0);
    expect(patchOf(0)).toEqual({ assigneeId: "p2", handoverNote: "Context" });
    expect(formNow()).toBeNull();
  });
});

// The code review of TH.3.2 proved each of these wrong in the first build.
describe("races the review found", () => {
  let answer = true;
  let asked = 0;
  beforeEach(() => {
    answer = true;
    asked = 0;
    vi.stubGlobal("window", { confirm: () => (asked++, answer) });
  });
  afterEach(() => vi.unstubAllGlobals());
  const cardA = card();
  const cardB = card({ id: "c2", title: "B" });
  const both = [cardA, cardB];

  it("keeps an edit undone while its save was out, and saves the undo, whenever the refresh comes", async () => {
    let release!: (v: Outcome) => void;
    updateCard.mockImplementationOnce(() => new Promise<Outcome>((r) => (release = r)));
    change((f) => ({ ...f, priority: "p1" }));
    await settle(PICK_DELAY_MS);
    change((f) => ({ ...f, priority: "p3" }));
    await settle(PICK_DELAY_MS);
    release({ ok: true });
    await settle(0);
    // The board's refresh after the first write still says P1.
    hook(card({ priority: "p1" }));
    expect(formNow()?.priority).toBe("p3");
    await settle(PICK_DELAY_MS * 4);
    expect(updateCard.mock.calls.map((c) => c[1])).toEqual([{ priority: "p1" }, { priority: "p3" }]);
    hook(card({ priority: "p3" }));
    expect(hook(card({ priority: "p3" })).autosave.state).toBe("saved");
  });

  it("switches card only once the card being left has saved everything, and then saves the next card's edits too", async () => {
    let release!: (v: Outcome) => void;
    updateCard.mockImplementationOnce(() => new Promise<Outcome>((r) => (release = r)));
    change((f) => ({ ...f, title: "A1" }), both);
    await settle(TYPING_DELAY_MS);
    change((f) => ({ ...f, description: "A more" }), both);
    hook(both).openCard(cardB);
    // A's first save is still out: the drawer is still on A.
    expect(formNow()?.id).toBe("c1");
    release({ ok: true });
    await vi.waitFor(() => expect(formNow()?.id).toBe("c2"));
    change((f) => ({ ...f, description: "B text" }), both);
    await settle(TYPING_DELAY_MS);
    expect(updateCard.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      ["c1", { title: "A1" }],
      ["c1", { description: "A more" }],
      ["c2", { description: "B text" }],
    ]);
    expect(hook(both).autosave.state).toBe("saved");
  });

  it("stays on a card whose save is refused on the way out, with the refusal in its own drawer", async () => {
    updateCard.mockImplementationOnce(async () => ({ ok: false, error: "A refused" }));
    change((f) => ({ ...f, title: "A edit" }), both);
    answer = false;
    hook(both).openCard(cardB);
    await vi.waitFor(() => expect(asked).toBe(1));
    expect(formNow()).toMatchObject({ id: "c1", title: "A edit" });
    expect(banner).toBe("A refused");
    expect(hook(both).autosave.state).toBe("failed");
    // Choosing to lose it moves on.
    answer = true;
    updateCard.mockImplementationOnce(async () => ({ ok: false, error: "A refused" }));
    hook(both).openCard(cardB);
    await vi.waitFor(() => expect(formNow()?.id).toBe("c2"));
  });

  it("saves an edit made on the card while its save on the way out was still running", async () => {
    let release!: (v: Outcome) => void;
    updateCard.mockImplementationOnce(() => new Promise<Outcome>((r) => (release = r)));
    change((f) => ({ ...f, title: "A1" }), both);
    hook(both).openCard(cardB);
    // Still on A: the person picks a priority before the drawer moves on.
    change((f) => ({ ...f, priority: "p1" }), both);
    release({ ok: true });
    await vi.waitFor(() => expect(formNow()?.id).toBe("c2"));
    expect(updateCard.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      ["c1", { title: "A1" }],
      ["c1", { priority: "p1" }],
    ]);
  });

  it("lets a field put back before its save fired follow another person's later change", async () => {
    change((f) => ({ ...f, priority: "p1" }));
    change((f) => ({ ...f, priority: "p3" }));
    await settle(PICK_DELAY_MS);
    expect(updateCard).not.toHaveBeenCalled();
    // Somebody else sets P2; the drawer shows it, and a later edit does not save P3 over it.
    hook(card({ priority: "p2" }));
    expect(formNow()?.priority).toBe("p2");
    change((f) => ({ ...f, dueDate: "2026-10-12" }), card({ priority: "p2" }));
    await settle(PICK_DELAY_MS);
    expect(patchOf(0)).toEqual({ dueDate: "2026-10-12" });
  });

  it("gives a created card's baseline to its own drawer only, not a new card opened meanwhile", async () => {
    let release!: (v: Outcome) => void;
    createCard.mockImplementationOnce(() => new Promise<Outcome>((r) => (release = r)));
    hook().openCreate("To do");
    change((f) => ({ ...f, title: "First" }));
    hook().save();
    // Closed while creating, and a fresh new card opened on the same board.
    slots[0] = null;
    hook().openCreate("To do");
    release({ ok: true, id: "new-1" });
    await settle(0);
    answer = false;
    hook().close();
    expect(asked).toBe(0);
    expect(formNow()).toBeNull();
  });

  it("says Couldn't save on a created card whose later step failed, and retries only that step", async () => {
    setCardSprint.mockImplementationOnce(async () => ({ ok: false, error: "sprint refused" }));
    hook().openCreate("To do");
    change((f) => ({ ...f, title: "New", description: "Desc", sprintId: "s1", dueDate: "2026-10-20" }));
    hook().save();
    await settle(0);
    const created = card({ id: "new-1", title: "New", description: "Desc", due_date: "2026-10-20" });
    const h = hook(created);
    expect(formNow()?.id).toBe("new-1");
    expect(h.autosave.state).toBe("failed");
    h.autosave.retry();
    await settle(0);
    expect(updateCard).not.toHaveBeenCalled();
    expect(setCardSprint.mock.calls.map((c) => c[0])).toEqual(["new-1", "new-1"]);
    expect(hook(created).autosave.state).toBe("saved");
  });
});

// Found in the browser, not by the stand-in above until it learned cleanups:
// StrictMode mounts, unmounts and mounts again in development, and the
// unmount left autosave believing the page was gone, so a close that waited
// for a save never closed.
describe("StrictMode's rehearsal unmount", () => {
  it("still closes the drawer once a waited-for save lands", async () => {
    cleanups.splice(0).forEach((c) => c());
    hook();
    change((f) => ({ ...f, priority: "p1" }));
    hook().close();
    await vi.waitFor(() => expect(formNow()).toBeNull());
    expect(patchOf(patchOfCalls() - 1)).toEqual({ priority: "p1" });
  });
});
const patchOfCalls = () => updateCard.mock.calls.length;

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// W.130 and W.131. What the drawer's Save sends for the estimate, and what the
// open drawer shows when the live card changes, pinned at the hook, so
// reverting the call site, either fold or the resync goes red too. The
// environment has no DOM, so useState is replaced by numbered slots in call
// order, as React keeps them: slot 0 is the form, slot 1 what it opened with.
// A render that sets state renders again, as React does.

const slots: unknown[] = [];
let cursor = 0;
let setDuringRender = false;
// W.138: React runs an updater function EAGERLY only when the component has
// nothing else queued. Mid-save it always has (the transition's own pending
// state), so the updater runs at the next render, after the save chain has
// moved on. `deferUpdaters` makes the stub do that: an updater waits in
// `queued` until the next render. Applying them eagerly is what let W.133's
// fold read a variable the chain had already reassigned, with every test green.
let deferUpdaters = false;
const queued: (() => void)[] = [];
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (init: unknown) => {
    const i = cursor++;
    if (!(i in slots)) slots[i] = typeof init === "function" ? (init as () => unknown)() : init;
    return [
      slots[i],
      (next: unknown) => {
        const apply = () => {
          slots[i] = typeof next === "function" ? (next as (prev: unknown) => unknown)(slots[i]) : next;
        };
        if (deferUpdaters && typeof next === "function") queued.push(apply);
        else apply();
        setDuringRender = true;
      },
    ];
  },
  useRef: (init: unknown) => {
    const i = cursor++;
    if (!(i in slots)) slots[i] = { current: init };
    return slots[i];
  },
  // TH.3.2: autosave keeps the rendered form in a ref after each commit. The
  // stub runs an effect as the render happens, which is when the next timer
  // or flush would read it; cleanups (the unmount flush) never run here.
  useEffect: (fn: () => unknown) => {
    fn();
  },
}));
const formNow = () => slots[0] as Record<string, unknown>;
type Outcome = { ok: boolean; error?: string; id?: string; persisted?: true };
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
// W.163 U7: what a new card held before it existed is handed to it on Create.
const handPendingToNewCard = vi.fn(async (_id: string): Promise<string | null> => null);
vi.mock("./new-card-deliverables", () => ({ handPendingToNewCard: (id: string) => handPendingToNewCard(id) }));

// Imported under another name because the hook runs outside React here, with
// useState stubbed above; the rules-of-hooks lint would otherwise read these
// plain calls as hook calls.
import { useCardForm as cardForm } from "./useCardForm";

const board = { id: "b1", slug: "b", name: "B", client_company_id: null, laneColumn: { "To do": "col-1" } };
const card = (humanTokens: number | null, subtaskTokens: (number | null)[]) =>
  ({
    id: "c1",
    board_id: "b1",
    columnId: "To do",
    title: "Old",
    priority: "p3",
    assignee_id: null,
    due_date: null,
    human_tokens: humanTokens,
    description: "",
    metadata: {},
    sprint_id: null,
    epic_id: null,
    subject_type: null,
    subject_label: null,
    subject_id: null,
    internal: false,
    subtasks: subtaskTokens.map((h, i) => ({ id: `s${i}`, human_tokens: h, done: false })),
  }) as never;
const dataWith = (c: unknown) => ({ boards: [board], cards: [c], lanes: [{ id: "To do" }], sprints: [], epics: [] }) as never;

let banner: string | null = null;
const refresh = vi.fn();
/** The hook as the board renders it while the server's copy of the card is `now`. */
function hook(now: unknown) {
  let running: Promise<void> | undefined;
  const render = () => cardForm({
    data: dataWith(now),
    sprintFilter: "all",
    epicFilter: [],
    setBanner: (m: string | null) => {
      banner = m;
    },
    router: { refresh } as never,
    startSaving: ((fn: () => Promise<void>) => {
      running = fn();
    }) as never,
    // Only the archive uses the runner, and no test here archives.
    run: vi.fn(),
  });
  let h!: ReturnType<typeof render>;
  for (let i = 0; i < 5; i++) {
    queued.splice(0).forEach((apply) => apply());
    cursor = 0;
    setDuringRender = false;
    h = render();
    if (!setDuringRender) break;
  }
  return { ...h, done: () => running };
}
const open = (c: unknown) => hook(c).openCard(c as never);
const edit = (fn: (f: Record<string, unknown>) => Record<string, unknown>) => {
  slots[0] = fn(formNow());
};
/**
 * Save now: Create card for a new card, and for a saved card what autosave
 * would send (TH.3.2), which runs outside the board's transition.
 */
async function save(now: unknown) {
  const h = hook(now);
  if (formNow()?.id) return void (await h.flush());
  h.save();
  await h.done();
}
const sent = (call: number) => updateCard.mock.calls[call][1] as { humanTokens?: unknown; title?: string };

beforeEach(() => {
  slots.length = 0;
  cursor = 0;
  deferUpdaters = false;
  queued.length = 0;
  banner = null;
  updateCard.mockReset().mockImplementation(async () => ({ ok: true }));
  createCard.mockReset().mockImplementation(async () => ({ ok: true, id: "new-1" }));
  setCardSprint.mockReset().mockImplementation(async () => ({ ok: true }));
  setCardEpic.mockReset().mockImplementation(async () => ({ ok: true }));
  refresh.mockReset();
  handPendingToNewCard.mockReset().mockImplementation(async () => null);
});

describe("the drawer's Save and the estimate", () => {
  it("sends no estimate when a subtask was sized after the drawer opened, and still sends the title", async () => {
    open(card(1, [null]));
    edit((f) => ({ ...f, title: "New" }));
    await save(card(0.3, [0.3]));
    expect(sent(0).title).toBe("New");
    expect(sent(0).humanTokens).toBeUndefined();
  });

  it("does not restore a sum the server cleared when the last sized subtask was cleared", async () => {
    // Opened derived at 0.3; the subtask is cleared and the server clears the
    // parent. The field still shows 0.3, untouched, and must not be sent.
    open(card(0.3, [0.3]));
    edit((f) => ({ ...f, title: "New" }));
    await save(card(null, [null]));
    expect(sent(0).humanTokens).toBeUndefined();
  });

  it("sends no estimate when another writer made the card derived and the board has not refreshed", async () => {
    open(card(1, [null]));
    edit((f) => ({ ...f, title: "New" }));
    await save(card(1, [null]));
    expect(sent(0).humanTokens).toBeUndefined();
  });

  it("sends no estimate typed before a subtask was sized in the same drawer", async () => {
    // Typed 2 while unsized, then sized a subtask: the field is read-only now
    // and the server refuses any figure but the sum, on every retry.
    open(card(null, [null]));
    edit((f) => ({ ...f, humanTokens: "2", title: "New" }));
    await save(card(0.3, [0.3]));
    expect(sent(0).title).toBe("New");
    expect(sent(0).humanTokens).toBeUndefined();
  });

  it("sends the figure the person typed, and null when they emptied the field", async () => {
    open(card(null, []));
    edit((f) => ({ ...f, humanTokens: "0.3" }));
    await save(card(null, []));
    expect(sent(0).humanTokens).toBe(0.3);

    slots.length = 0;
    open(card(1, []));
    edit((f) => ({ ...f, humanTokens: "" }));
    await save(card(1, []));
    expect(sent(1).humanTokens).toBeNull();
  });

  it("does not resend an estimate the update already saved when a later step fails and the save runs again", async () => {
    open(card(1, []));
    edit((f) => ({ ...f, humanTokens: "0.5", sprintId: "sprint-1" }));
    setCardSprint.mockImplementationOnce(async () => ({ ok: false, error: "sprint down" }));
    await save(card(1, []));
    expect(banner).toBe("sprint down");
    expect(sent(0).humanTokens).toBe(0.5);
    // TH.3.2: only what is still unsaved goes again, so the retry is the sprint alone.
    await save(card(0.5, []));
    expect(updateCard).toHaveBeenCalledTimes(1);
    expect(setCardSprint).toHaveBeenCalledTimes(2);
  });

  it("sends a PR pasted on a new card with the card itself (bug hunt F10)", async () => {
    hook(card(null, [])).openCreate("To do");
    edit((f) => ({ ...f, title: "T", prUrl: "https://github.com/edge8-ai/edge8-web/pull/1800" }));
    await save(card(null, []));
    expect((createCard.mock.calls[0][0] as { prUrl?: unknown }).prUrl).toBe("https://github.com/edge8-ai/edge8-web/pull/1800");
  });

  it("does not resend a new card's estimate when a later step fails and Save runs again", async () => {
    hook(card(null, [])).openCreate("To do");
    edit((f) => ({ ...f, title: "T", humanTokens: "0.3", sprintId: "sprint-1" }));
    setCardSprint.mockImplementationOnce(async () => ({ ok: false, error: "sprint down" }));
    await save(card(null, []));
    expect((createCard.mock.calls[0][0] as { humanTokens?: unknown }).humanTokens).toBe(0.3);
    await save(card(null, []));
    expect(createCard).toHaveBeenCalledTimes(1);
    // TH.3.2: the created card is the baseline, so nothing but the sprint is sent again.
    expect(updateCard).not.toHaveBeenCalled();
    expect(setCardSprint).toHaveBeenCalledTimes(2);
  });

  // W.131: the live card changed under the open drawer.
  it("shows the cleared estimate once the last sized subtask is cleared, and leaves it unsent", async () => {
    open(card(0.3, [0.3]));
    hook(card(null, [null]));
    expect(formNow().humanTokens).toBe("");
    edit((f) => ({ ...f, title: "New" }));
    await save(card(null, [null]));
    expect(sent(0).humanTokens).toBeUndefined();
  });

  it("follows an untouched field and keeps an edited one when the live card changes", async () => {
    open(card(1, []));
    edit((f) => ({ ...f, description: "My notes" }));
    hook({ ...(card(1, []) as object), title: "Renamed elsewhere", description: "Their notes" });
    expect(formNow().title).toBe("Renamed elsewhere");
    expect(formNow().description).toBe("My notes");
  });

  it("still sends the edit when the update itself failed and Save runs again", async () => {
    open(card(1, []));
    edit((f) => ({ ...f, humanTokens: "0.5" }));
    updateCard.mockImplementationOnce(async () => ({ ok: false, error: "boom" }));
    await save(card(1, []));
    expect(banner).toBe("boom");
    await save(card(1, []));
    expect(sent(1).humanTokens).toBe(0.5);
  });
});

// W.133: a save still running for card A must not land on card B, which the
// person opened after closing A's drawer.
describe("a save in flight and the next card", () => {
  const cardB = () => ({ ...(card(2, []) as object), id: "c2", title: "B" }) as never;

  it("leaves card B's edits and drawer alone while card A's save finishes", async () => {
    open(card(1, []));
    edit((f) => ({ ...f, title: "A edited", sprintId: "s1" }));
    let releaseUpdate!: (v: Outcome) => void;
    let releaseSprint!: (v: Outcome) => void;
    updateCard.mockImplementationOnce(() => new Promise<Outcome>((r) => { releaseUpdate = r; }));
    setCardSprint.mockImplementationOnce(() => new Promise<Outcome>((r) => { releaseSprint = r; }));
    const aSaving = hook(card(1, [])).flush();

    // The person closes A and opens B, typing an estimate and a handover note.
    slots[0] = null;
    hook(cardB()).openCard(cardB());
    edit((f) => ({ ...f, humanTokens: "3", handoverNote: "over to you" }));

    releaseUpdate({ ok: true });
    await vi.waitFor(() => expect(setCardSprint).toHaveBeenCalled());
    // A's fold after its update did not touch B.
    expect(formNow()).toMatchObject({ id: "c2", humanTokens: "3", origHumanTokens: "2", handoverNote: "over to you" });

    releaseSprint({ ok: true });
    await aSaving;
    // A's save did not close B.
    expect(formNow()).toMatchObject({ id: "c2", humanTokens: "3" });
  });

  // TH.3.2: a saved card saves itself, and saving it leaves the drawer open.
  it("leaves its own drawer open when it finishes", async () => {
    open(card(1, []));
    edit((f) => ({ ...f, title: "A edited" }));
    await save(card(1, []));
    expect(formNow()).toMatchObject({ id: "c1", title: "A edited" });
  });
});

// W.134: the lane is the view's grouping, not the card's, so a resync keeps
// the one the drawer opened with.
describe("the resync and the lane", () => {
  it("keeps the lane the drawer opened in when the live card changes", () => {
    const grouped = { ...(card(1, []) as object), columnId: "Group: Dana" } as never;
    hook(grouped).openCard(grouped);
    hook({ ...(card(1, []) as object), title: "Renamed elsewhere", laneId: "To do" });
    expect(formNow().title).toBe("Renamed elsewhere");
    expect(formNow().laneId).toBe("Group: Dana");
  });
});

// W.138: Create card filed duplicates. React applied the save's folds after the
// chain had reassigned the id it compared against, so none of them landed: the
// drawer stayed a New card and the next click inserted again.
describe("creating a card when React applies the folds late", () => {
  beforeEach(() => {
    deferUpdaters = true;
  });

  it("closes the drawer once the card is created", async () => {
    hook(card(null, [])).openCreate("To do");
    edit((f) => ({ ...f, title: "T", sprintId: "sprint-1" }));
    await save(card(null, []));
    hook(card(null, []));
    expect(createCard).toHaveBeenCalledTimes(1);
    expect(formNow()).toBeNull();
  });

  it("updates the created card, and creates no second one, when Save runs again after a later step failed", async () => {
    hook(card(null, [])).openCreate("To do");
    edit((f) => ({ ...f, title: "T", sprintId: "sprint-1" }));
    setCardSprint.mockImplementationOnce(async () => ({ ok: false, error: "sprint down" }));
    await save(card(null, []));
    hook(card(null, []));
    expect(formNow()).toMatchObject({ id: "new-1", origSprintId: "" });
    expect(hook(card(null, [])).autosave.state).toBe("failed");
    await save(card(null, []));
    expect(createCard).toHaveBeenCalledTimes(1);
    // TH.3.2: the card as created is the baseline, so only the sprint goes
    // again; the title and description it was created with are not resent.
    expect(updateCard).not.toHaveBeenCalled();
    expect(setCardSprint).toHaveBeenCalledTimes(2);
    expect(setCardSprint.mock.calls[1][0]).toBe("new-1");
  });

  it("sends one create for a double click, before the first has answered", async () => {
    hook(card(null, [])).openCreate("To do");
    edit((f) => ({ ...f, title: "T" }));
    let release!: (v: Outcome) => void;
    createCard.mockImplementationOnce(() => new Promise<Outcome>((r) => { release = r; }));
    const h = hook(card(null, []));
    h.save();
    const first = h.done();
    h.save();
    expect(createCard).toHaveBeenCalledTimes(1);
    release({ ok: true, id: "new-1" });
    await first;
    // Once the first save has settled, Save works again.
    hook(card(null, [])).save();
    expect(createCard).toHaveBeenCalledTimes(1);
  });
});

// W.141: Esc, the backdrop and the × closed the drawer and threw away edits
// that only Save persists, without a word.
describe("closing the drawer with edits in it", () => {
  let answer = true;
  let asked = 0;
  beforeEach(() => {
    answer = true;
    asked = 0;
    vi.stubGlobal("window", { confirm: () => (asked++, answer) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("closes a card nobody changed without asking", () => {
    open(card(1, []));
    hook(card(1, [])).close();
    expect(asked).toBe(0);
    expect(formNow()).toBeNull();
  });

  // TH.3.2: a saved card's edit is saved on the way out, so there is nothing to ask.
  it("saves an edit as it closes, without asking", async () => {
    open(card(1, []));
    edit((f) => ({ ...f, description: "Half a thought" }));
    hook(card(1, [])).close();
    await vi.waitFor(() => expect(formNow()).toBeNull());
    expect(asked).toBe(0);
    expect(updateCard.mock.calls[0][1]).toEqual({ description: "Half a thought" });
  });

  it("stays on the card when the save on the way out is refused, unless the person chooses to lose it", async () => {
    open(card(1, []));
    edit((f) => ({ ...f, description: "Half a thought" }));
    updateCard.mockImplementationOnce(async () => ({ ok: false, error: "boom" }));
    answer = false;
    hook(card(1, [])).close();
    await vi.waitFor(() => expect(asked).toBe(1));
    expect(formNow()).toMatchObject({ id: "c1", description: "Half a thought" });
    expect(banner).toBe("boom");
  });

  it("asks before closing a saved card whose title was emptied, which cannot be saved", () => {
    open(card(1, []));
    edit((f) => ({ ...f, title: "  " }));
    answer = false;
    hook(card(1, [])).close();
    expect(asked).toBe(1);
    expect(formNow()).toMatchObject({ title: "  " });
    expect(updateCard).not.toHaveBeenCalled();
  });

  it("closes a blank new card without asking, and asks once it has a title", () => {
    hook(card(null, [])).openCreate("To do");
    hook(card(null, [])).close();
    expect(asked).toBe(0);
    expect(formNow()).toBeNull();
    hook(card(null, [])).openCreate("To do");
    edit((f) => ({ ...f, title: "Chase the invoice" }));
    answer = false;
    hook(card(null, [])).close();
    expect(asked).toBe(1);
    expect(formNow()).toMatchObject({ title: "Chase the invoice" });
  });

  it("clears the last card's message when another card opens", () => {
    banner = "Card moved, but its history could not be written";
    open(card(1, []));
    expect(banner).toBeNull();
  });
});

describe("switching card with edits in the drawer", () => {
  let answer = true;
  let asked = 0;
  beforeEach(() => {
    answer = true;
    asked = 0;
    vi.stubGlobal("window", { confirm: () => (asked++, answer) });
  });
  afterEach(() => vi.unstubAllGlobals());
  const cardB = () => ({ ...(card(2, []) as object), id: "c2", title: "B" }) as never;

  // TH.3.2: the card being left saves its edit and the link opens at once.
  it("saves an edited card when a blocker's card link replaces it, without asking", async () => {
    open(card(1, []));
    edit((f) => ({ ...f, description: "Unsaved" }));
    hook(card(1, [])).openCard(cardB());
    await vi.waitFor(() => expect(formNow()).toMatchObject({ id: "c2" }));
    expect(asked).toBe(0);
    expect(updateCard.mock.calls[0]).toEqual(["c1", { description: "Unsaved" }, "b"]);
  });

  it("never asks when nothing was changed", () => {
    open(card(1, []));
    hook(card(1, [])).openCard(cardB());
    expect(asked).toBe(0);
    expect(formNow()).toMatchObject({ id: "c2" });
  });
});

describe("a section's unsent draft", () => {
  let answer = true;
  let asked = 0;
  beforeEach(() => {
    answer = true;
    asked = 0;
    vi.stubGlobal("window", { confirm: () => (asked++, answer) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("counts toward the close question even when the form itself is unchanged", () => {
    open(card(1, []));
    hook(card(1, [])).drafts.current.add("comment");
    answer = false;
    hook(card(1, [])).close();
    expect(asked).toBe(1);
    expect(formNow()).not.toBeNull();
    answer = true;
    hook(card(1, [])).close();
    expect(formNow()).toBeNull();
  });
});

// W.163 U7: a new card's held files and links go to the card Create made,
// once, and a link it could not take is said on the board.
describe("a new card's held deliverables", () => {
  it("are handed to the new card's id once it is created, and not again on a retry", async () => {
    hook(card(null, [])).openCreate("To do");
    edit((f) => ({ ...f, title: "T", sprintId: "sprint-1" }));
    setCardSprint.mockImplementationOnce(async () => ({ ok: false, error: "sprint down" }));
    await save(card(null, []));
    expect(handPendingToNewCard).toHaveBeenCalledTimes(1);
    expect(handPendingToNewCard).toHaveBeenCalledWith("new-1");
    hook(card(null, []));
    await save(card(null, []));
    expect(handPendingToNewCard).toHaveBeenCalledTimes(1);
  });

  it("are not handed anywhere when the card was not created", async () => {
    createCard.mockImplementationOnce(async () => ({ ok: false, error: "no" }));
    hook(card(null, [])).openCreate("To do");
    edit((f) => ({ ...f, title: "T" }));
    await save(card(null, []));
    expect(handPendingToNewCard).not.toHaveBeenCalled();
  });

  it("put a link the card could not take on the board's banner as the drawer closes", async () => {
    handPendingToNewCard.mockImplementationOnce(async () => "The card was created, but the link x could not be added.");
    hook(card(null, [])).openCreate("To do");
    edit((f) => ({ ...f, title: "T" }));
    await save(card(null, []));
    hook(card(null, []));
    expect(banner).toMatch(/could not be added/);
    expect(formNow()).toBeNull();
  });

  // Review of W.163: a later step failing returned before the handover was
  // read, so the link the card could not take was never mentioned.
  it("still say a link the card could not take when a later step fails", async () => {
    handPendingToNewCard.mockImplementationOnce(async () => "The link x could not be added.");
    setCardSprint.mockImplementationOnce(async () => ({ ok: false, error: "sprint down" }));
    hook(card(null, [])).openCreate("To do");
    edit((f) => ({ ...f, title: "T", sprintId: "sprint-1" }));
    await save(card(null, []));
    await Promise.resolve();
    hook(card(null, []));
    expect(banner).toMatch(/sprint down/);
    expect(banner).toMatch(/could not be added/);
  });

  // A.47: the epic step answered a refusal with the banner alone, so the board
  // behind the form was never re-synced and the held link went unmentioned.
  it("refresh the board and still say a link the card could not take when the epic step fails", async () => {
    handPendingToNewCard.mockImplementationOnce(async () => "The link x could not be added.");
    setCardEpic.mockImplementationOnce(async () => ({ ok: false, error: "epic down" }));
    hook(card(null, [])).openCreate("To do");
    edit((f) => ({ ...f, title: "T", epicId: "epic-1" }));
    await save(card(null, []));
    await Promise.resolve();
    hook(card(null, []));
    expect(setCardEpic).toHaveBeenCalledWith("new-1", "epic-1", "b");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(banner).toMatch(/epic down/);
    expect(banner).toMatch(/could not be added/);
    expect(formNow()?.id).toBe("new-1");
  });
});

// A.54. A write the server took with a follow-up that did not land ("Card
// created, but", "committed, but the history could not be written") is not a
// failed save: the row is there, so the drawer keeps it and the board says
// what did not follow. Marking it failed sent autosave to retry a write the
// server would find already done.
describe("a step the server took but could not finish", () => {
  const sprintTookBut = { ok: false, persisted: true as const, error: "Card moved to the sprint, but the stage history could not be written: timeout" };

  it("lands a saved card's sprint and says what did not follow, without marking the save failed", async () => {
    open(card(1, []));
    edit((f) => ({ ...f, sprintId: "sprint-1" }));
    setCardSprint.mockImplementationOnce(async () => sprintTookBut);
    await save(card(1, []));
    expect(banner).toBe(sprintTookBut.error);
    expect(refresh).not.toHaveBeenCalled();
    expect(formNow()).toMatchObject({ origSprintId: "sprint-1" });
    expect(hook(card(1, [])).autosave.state).not.toBe("failed");
    // Nothing is left unsaved, so nothing is sent again.
    await save(card(1, []));
    expect(setCardSprint).toHaveBeenCalledTimes(1);
  });

  it("goes on from a card created with a follow-up that failed, and says so on the board", async () => {
    hook(card(null, [])).openCreate("To do");
    edit((f) => ({ ...f, title: "T", sprintId: "sprint-1" }));
    createCard.mockImplementationOnce(async () => ({ ok: false, persisted: true, error: "Card created, but its stage history could not be written: timeout", id: "new-1" }));
    await save(card(null, []));
    expect(createCard).toHaveBeenCalledTimes(1);
    expect(setCardSprint).toHaveBeenCalledWith("new-1", "sprint-1", "b");
    expect(banner).toBe("Card created, but its stage history could not be written: timeout");
    expect(refresh).not.toHaveBeenCalled();
    hook(card(null, []));
    expect(formNow()).toBeNull();
  });

  it("closes a new card's drawer when its sprint was committed with a follow-up that failed", async () => {
    hook(card(null, [])).openCreate("To do");
    edit((f) => ({ ...f, title: "T", sprintId: "sprint-1" }));
    setCardSprint.mockImplementationOnce(async () => sprintTookBut);
    await save(card(null, []));
    expect(banner).toBe(sprintTookBut.error);
    expect(refresh).not.toHaveBeenCalled();
    hook(card(null, []));
    expect(formNow()).toBeNull();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

// W.141: three controls showed their answer before the server gave one, and
// none of them took it back when the server said no. The environment has no
// DOM, so React's hooks are numbered slots here, as React keeps them; a render
// that sets state renders again.

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
  useEffect: () => {},
  useMemo: (fn: () => unknown) => fn(),
}));
vi.mock("@/entities/boards/lib/actions", () => ({ createCard: vi.fn() }));
vi.mock("@/entities/boards/lib/epic-actions", () => ({ setCardEpic: vi.fn() }));
vi.mock("@/entities/boards/lib/sprint-actions", () => ({ setCardSprint: vi.fn() }));

// Imported under other names: these hooks run outside React here, and the
// rules-of-hooks lint would read plain calls to `use…` as hook calls.
import { useWorkboardCardSubtasks as cardSubtasks } from "./WorkboardCardSubtasks";
import { useWorkboardQuickAdd as quickAddFor } from "./useWorkboardQuickAdd";
import { useSectionKey as sectionKey } from "./card-drawer-sections";

function render<T>(fn: () => T): T {
  let out!: T;
  for (let i = 0; i < 5; i++) {
    cursor = 0;
    setDuringRender = false;
    out = fn();
    if (!setDuringRender) break;
  }
  return out;
}

beforeEach(() => {
  slots.length = 0;
});

describe("a refused tick on the board", () => {
  const subtasks = [{ id: "s1", title: "One", done: false, human_tokens: null, assignee_id: null, assignee_name: null }];

  it("is put back when the server refuses it", () => {
    let refuse!: () => void;
    const onToggle = (_id: string, _done: boolean, onFail: () => void) => {
      refuse = onFail;
    };
    const s = render(() => cardSubtasks("c1", subtasks, onToggle));
    s.toggle(subtasks[0]);
    expect(render(() => cardSubtasks("c1", subtasks, onToggle)).doneOf(subtasks[0])).toBe(true);
    refuse();
    const after = render(() => cardSubtasks("c1", subtasks, onToggle));
    expect(after.doneOf(subtasks[0])).toBe(false);
    expect(after.done).toBe(0);
  });
});

describe("a quick-add the board cannot make", () => {
  it("hands its row back when the column is gone, without asking the server", () => {
    const run = vi.fn();
    const single = { id: "b1", slug: "b", laneColumn: {} } as never;
    const add = render(() => quickAddFor({ single, canAdd: true, sprintFilter: "all", epicFilter: [], run }))!;
    const onFail = vi.fn();
    add("To do", "Chase the invoice", () => {}, onFail);
    expect(onFail).toHaveBeenCalledTimes(1);
    expect(run).not.toHaveBeenCalled();
  });

  it("gives the runner the same way back for a refusal from the server", () => {
    const run = vi.fn();
    const single = { id: "b1", slug: "b", laneColumn: { "To do": "col-1" } } as never;
    const add = render(() => quickAddFor({ single, canAdd: true, sprintFilter: "all", epicFilter: [], run }))!;
    const onFail = vi.fn();
    add("To do", "Chase the invoice", () => {}, onFail);
    expect(run.mock.calls[0][2]).toBe(onFail);
  });
});

describe("the drawer's section key", () => {
  it("changes when the drawer switches in place to another card", () => {
    const first = render(() => sectionKey("a"));
    expect(render(() => sectionKey("b"))).not.toBe(first);
  });

  it("does not change when a new card gets its id half-way through Create", () => {
    const blank = render(() => sectionKey(null));
    expect(render(() => sectionKey("new-id"))).toBe(blank);
  });
});

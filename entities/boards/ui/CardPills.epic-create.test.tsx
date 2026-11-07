import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Result } from "@/kernel/data/result";
import type { EpicRow } from "@/entities/boards/lib/types";
import type { Form } from "./board-view-types";

// W.163 F11. Creating an epic from the card's picker lands after two awaits
// (create the epic, then file the card in it). The form it lands in must be
// the form as it is THEN: an edit made while the epic was being created stays,
// and a drawer that has moved to another card, or closed, is left alone. The
// old code spread the form this render had closed over, so it put the old
// title back, and re-opened a closed drawer on the card it was made for.

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

let created: Deferred<Result & { id?: string }>;
let filed: Deferred<Result>;
vi.mock("@/entities/boards/lib/epic-actions", () => ({
  createEpic: vi.fn(() => created.promise),
  setCardEpic: vi.fn(() => filed.promise),
}));

// The picker opens its panel on a click, which a static render cannot make,
// so the panel is drawn at once and the epic panel hands over its props.
let panel: { onCreate?: (name: string) => Promise<Result> } = {};
vi.mock("./CardPillPicker", () => ({
  CardPillPicker: ({ children }: { children: (close: () => void) => ReactNode }) => <>{children(() => {})}</>,
}));
vi.mock("./CardPillPanels", () => ({
  EpicPanel: (props: { onCreate?: (name: string) => Promise<Result> }) => {
    panel = props;
    return null;
  },
  SprintPanel: () => null,
  PrPanel: () => null,
}));

import { CardPills } from "./CardPills";

const asked = { id: "t1", boardId: "b1", title: "Rebuild the drawer", epicId: "", origEpicId: "", sprintId: "", prUrl: "" } as unknown as Form;

/** Starts "Create epic" on `form` and returns the updater it hands the drawer once both awaits land. */
async function createFrom(form: Form, saved = true) {
  created = deferred();
  filed = deferred();
  const setForm = vi.fn();
  renderToStaticMarkup(
    <CardPills
      form={form}
      setForm={setForm}
      activeSprints={[]}
      allSprints={[]}
      activeEpics={[] as EpicRow[]}
      allEpics={[] as EpicRow[]}
      boardSlug="build"
      prSynced={null}
      readOnly={false}
    />,
  );
  const pending = panel.onCreate!("Billing");
  created.resolve({ ok: true, id: "e-new" });
  filed.resolve(saved ? { ok: true } : { ok: false, error: "no" });
  expect(await pending).toEqual({ ok: true });
  expect(setForm).toHaveBeenCalledTimes(1);
  const update = setForm.mock.calls[0][0];
  // An object here is the bug itself: a snapshot taken before the awaits.
  expect(typeof update).toBe("function");
  return update as (f: Form | null) => Form | null;
}

describe("CardPills: creating an epic (W.163 F11)", () => {
  beforeEach(() => {
    panel = {};
  });

  it("keeps an edit made while the epic was being created, and records the epic as chosen and stored", async () => {
    const update = await createFrom(asked);
    const edited = { ...asked, title: "Rebuild the drawer, properly", dueDate: "2026-10-09" } as Form;
    expect(update(edited)).toEqual({ ...edited, epicId: "e-new", origEpicId: "e-new" });
  });

  it("leaves another card alone when the drawer has moved on", async () => {
    const update = await createFrom(asked);
    const other = { ...asked, id: "t2", title: "Another card" } as Form;
    expect(update(other)).toBe(other);
  });

  it("does not re-open a drawer that was closed meanwhile", async () => {
    const update = await createFrom(asked);
    expect(update(null)).toBeNull();
  });

  it("files a new card's epic on the new card it was made from, and on no card of another board", async () => {
    const draft = { ...asked, id: null } as unknown as Form;
    const update = await createFrom(draft, false);
    const typed = { ...draft, title: "Typed meanwhile" } as Form;
    expect(update(typed)).toEqual({ ...typed, epicId: "e-new" });
    const moved = { ...draft, boardId: "b2" } as Form;
    expect(update(moved)).toBe(moved);
  });
});

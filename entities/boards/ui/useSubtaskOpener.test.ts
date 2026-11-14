import { beforeEach, describe, expect, it, vi } from "vitest";

// W.163 F12. "+ Subtask" opens the card's Subtasks section and the person
// starts typing; a look at the History tab unmounted the Details panel that
// held both, so the way back found the section shut and the text gone. The
// drawer now holds them, per card. The environment has no DOM, so useState is
// one slot here, as React keeps it for the drawer across the tab switch; a
// render that sets state renders again, as React does.

let slot: unknown;
let has = false;
let setDuringRender = false;
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (init: unknown) => {
    if (!has) {
      slot = init;
      has = true;
    }
    return [
      slot,
      (next: unknown) => {
        slot = typeof next === "function" ? (next as (prev: unknown) => unknown)(slot) : next;
        setDuringRender = true;
      },
    ];
  },
}));

// Imported under another name because it runs outside React here.
import { useSubtaskOpener as subtaskOpener } from "./useSubtaskOpener";

function render(cardId: string | null) {
  let out = subtaskOpener(cardId);
  for (let i = 0; setDuringRender && i < 5; i++) {
    setDuringRender = false;
    out = subtaskOpener(cardId);
  }
  setDuringRender = false;
  return out;
}

describe("useSubtaskOpener (W.163 F12)", () => {
  beforeEach(() => {
    has = false;
    setDuringRender = false;
  });

  it("keeps the opened section and the typed subtask for the card while the drawer stays on it", () => {
    render("t1").open();
    render("t1").setDraft("Write the copy");
    // The History tab and back: the drawer renders again on the same card.
    const back = render("t1");
    expect(back.opened).toBe(true);
    expect(back.draft).toBe("Write the copy");
  });

  it("starts another card, or a closed drawer, shut and empty", () => {
    const a = render("t1");
    a.open();
    render("t1").setDraft("Write the copy");
    expect(render("t2")).toMatchObject({ opened: false, draft: "" });
    render("t1");
    expect(render(null)).toMatchObject({ opened: false, draft: "" });
  });

  it("drops a change made on one card that lands after the drawer moved to another", () => {
    const onA = render("t1");
    render("t2");
    onA.open();
    onA.setDraft("Meant for t1");
    expect(render("t2")).toMatchObject({ opened: false, draft: "" });
  });
});

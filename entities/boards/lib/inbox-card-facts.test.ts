import { describe, expect, it } from "vitest";
import { inboxFactsFrom } from "./inbox-card-facts";

// TH.8. What the team Inbox is told about the cards its reminders name. The
// lane decides whether a card is still work, as everywhere on the board: a card
// sitting in a Done or Not Doing lane is not work whatever its stored status.

const row = (id: string, over: Partial<Parameters<typeof inboxFactsFrom>[0][number]> = {}) => ({
  id,
  title: `Card ${id}`,
  status: "open",
  parent_task_id: null,
  archived_at: null,
  column: { is_done: false, is_not_doing: false },
  ...over,
});

describe("inboxFactsFrom", () => {
  it("calls an open card in a working lane still work", () => {
    expect(inboxFactsFrom([row("a")], []).get("a")).toEqual({ id: "a", title: "Card a", open: true, parent: null });
  });

  it("calls a card finished by its lane, set aside, archived or stored done no longer work", () => {
    const facts = inboxFactsFrom(
      [
        row("lane-done", { column: { is_done: true, is_not_doing: false } }),
        row("set-aside", { column: [{ is_done: false, is_not_doing: true }] }),
        row("archived", { archived_at: "2026-10-17T00:00:00Z" }),
        row("stored-done", { status: "done" }),
      ],
      [],
    );
    expect([...facts.values()].map((f) => [f.id, f.open])).toEqual([
      ["lane-done", false],
      ["set-aside", false],
      ["archived", false],
      ["stored-done", false],
    ]);
  });

  it("names a subtask's card, and no parent when the parent was not read", () => {
    const facts = inboxFactsFrom([row("kid", { parent_task_id: "p" }), row("orphan", { parent_task_id: "missing" })], [{ id: "p", title: "W.123 Plan" }]);
    expect(facts.get("kid")?.parent).toEqual({ id: "p", title: "W.123 Plan" });
    expect(facts.get("orphan")?.parent).toBeNull();
  });
});

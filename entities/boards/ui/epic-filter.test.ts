import { describe, expect, it } from "vitest";
import { epicFilterNames, epicFilterOptions } from "./epic-filter";

// What the epic picker promises across boards (W.37): every option names its
// board, the options arrive grouped board by board, and the sentence calls a
// chosen epic exactly what the option that chose it was called.

const boards = [
  { id: "b1", name: "Edge8" },
  { id: "b2", name: "Acme Ops" },
];

const epics = [
  { id: "e1", board_id: "b2", name: "Commerce & Billing" },
  { id: "e2", board_id: "b1", name: "Workboard UX" },
  { id: "e3", board_id: "b2", name: "Onboarding" },
  { id: "e4", board_id: "b1", name: "Commerce & Billing" },
];

describe("epicFilterOptions", () => {
  it("offers nothing where there are no epics, so the filter hides itself", () => {
    expect(epicFilterOptions([], boards, true)).toEqual([]);
  });

  it("leaves the board out on a single board, where it would be on every option", () => {
    const only = epics.filter((e) => e.board_id === "b1");
    expect(epicFilterOptions(only, [boards[0]], true)).toEqual([
      { value: "e2", label: "Workboard UX" },
      { value: "e4", label: "Commerce & Billing" },
      { value: "none", label: "No epic" },
    ]);
  });

  // Epics are board-scoped, so two boards may each have a "Commerce & Billing"
  // and they are different epics: across boards the name alone is a trap.
  it("groups by board and names the board on every option across boards", () => {
    expect(epicFilterOptions(epics, boards, false)).toEqual([
      { value: "e2", label: "Edge8 · Workboard UX" },
      { value: "e4", label: "Edge8 · Commerce & Billing" },
      { value: "e1", label: "Acme Ops · Commerce & Billing" },
      { value: "e3", label: "Acme Ops · Onboarding" },
      { value: "none", label: "No epic" },
    ]);
  });

  it("keeps an epic whose board is not in view, last and unqualified", () => {
    const orphan = [{ id: "e9", board_id: "gone", name: "Old" }, ...epics];
    const labels = epicFilterOptions(orphan, boards, false).map((o) => o.label);
    expect(labels[labels.length - 2]).toBe("Old");
  });
});

describe("epicFilterNames", () => {
  it("calls each epic what the picker called it", () => {
    expect(epicFilterNames(epics, boards, false).find((n) => n.id === "e1")?.name).toBe("Acme Ops · Commerce & Billing");
    expect(epicFilterNames(epics, boards, true).find((n) => n.id === "e1")?.name).toBe("Commerce & Billing");
  });
});

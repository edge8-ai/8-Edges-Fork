import { describe, expect, it, vi } from "vitest";
import { canCreateEpic, createEpicForCard, defaultActive, epicComboOptions, filterEpics, pillsToDraw, prPillLabel, shortDate, sprintPillLabel } from "./card-pills";

// The header's pills (docs/plans/2026-09-29-card-planning-pills.md): epic,
// sprint and PR are always on screen where the card can have them, never
// required, and a read-only surface shows only what they hold.
const empty = { epicId: "", sprintId: "", prUrl: "" };

describe("pillsToDraw", () => {
  it("draws all three on every card a person can edit, even while they are empty (W.152)", () => {
    expect(pillsToDraw(empty, false)).toEqual(["epic", "sprint", "pr"]);
  });

  it("draws only what holds a value on a surface that cannot write", () => {
    expect(pillsToDraw(empty, true)).toEqual([]);
    expect(pillsToDraw({ epicId: "e1", sprintId: "", prUrl: " " }, true)).toEqual(["epic"]);
  });
});

describe("prPillLabel", () => {
  it("names a GitHub pull request by its number", () => {
    expect(prPillLabel("https://github.com/edge8-ai/edge8-web/pull/1732")).toBe("PR #1732");
    expect(prPillLabel("https://github.com/edge8-ai/edge8-web/pull/1732/files")).toBe("PR #1732");
    expect(prPillLabel(" https://github.com/x/y/pull/9#discussion ")).toBe("PR #9");
  });

  it("falls back to plain PR for a link it cannot read a number from", () => {
    expect(prPillLabel("https://gitlab.com/x/y/-/merge_requests")).toBe("PR");
    expect(prPillLabel("https://github.com/x/y/pull/12abc")).toBe("PR");
  });
});

describe("sprintPillLabel", () => {
  it("names the sprint and the day it starts, without the year", () => {
    expect(sprintPillLabel({ name: "W40", starts_on: "2026-09-29" }, false)).toBe("W40 · Sep 29");
    expect(shortDate("2026-10-06")).toBe("Oct 6");
  });

  it("says a sprint has closed rather than reading as no sprint (W.142)", () => {
    expect(sprintPillLabel({ name: "W38", starts_on: "2026-09-15" }, true)).toBe("W38 · closed");
    expect(sprintPillLabel(undefined, true)).toBe("Its sprint · closed");
  });
});

describe("filterEpics", () => {
  const epics = [
    { name: "Commerce & Billing", description: "Orders, invoices, payments" },
    { name: "Hiring", description: null },
    { name: "Ops", description: "Routines and crons" },
  ];

  it("matches the description as well as the name, which is how domains are told apart (W.42)", () => {
    expect(filterEpics(epics, "invoice").map((e) => e.name)).toEqual(["Commerce & Billing"]);
    expect(filterEpics(epics, "HIR").map((e) => e.name)).toEqual(["Hiring"]);
  });

  it("keeps the given A to Z order and returns everything for an empty search (PR 1680)", () => {
    expect(filterEpics(epics, "  ").map((e) => e.name)).toEqual(["Commerce & Billing", "Hiring", "Ops"]);
  });
});

describe("canCreateEpic (W.153)", () => {
  const epics = [{ name: "Workboard UX", description: null }, { name: "Website", description: "The public site" }];

  it("offers to create what was typed when no epic on the board has that name", () => {
    expect(canCreateEpic(epics, "Onboarding")).toBe(true);
  });

  it("never offers a second epic with a name the board already has, whatever the case or spaces", () => {
    expect(canCreateEpic(epics, "  workboard ux ")).toBe(false);
  });

  it("offers nothing for an empty search", () => {
    expect(canCreateEpic(epics, "   ")).toBe(false);
  });

  it("still offers a new name that only partly matches an existing one", () => {
    expect(canCreateEpic(epics, "Work")).toBe(true);
  });
});

describe("epicComboOptions (W.153, review P1)", () => {
  it("lists the kept epics, then Create, then No epic, all as options of one listbox", () => {
    const opts = epicComboOptions([{ id: "e1", name: "Workboard UX" }], true, true);
    expect(opts.map((o) => o.kind)).toEqual(["epic", "create", "clear"]);
  });

  it("offers neither Create nor No epic when there is nothing to create or clear", () => {
    expect(epicComboOptions([{ id: "e1", name: "Website" }], false, false).map((o) => o.kind)).toEqual(["epic"]);
  });
});

describe("defaultActive (W.153, review P2)", () => {
  const opts = (names: string[], creatable: boolean) =>
    epicComboOptions(names.map((name, i) => ({ id: `e${i}`, name })), creatable, false);

  it("highlights Create when no epic's name holds what was typed, so Enter creates it", () => {
    expect(defaultActive(opts([], true), "Onboarding")).toBe(0);
    // "invoice" kept Commerce through its description; Enter must not file the card there.
    const kept = opts(["Commerce & Billing"], true);
    expect(kept[defaultActive(kept, "invoice")].kind).toBe("create");
  });

  it("highlights the first epic whose name holds what was typed, with Create one arrow away", () => {
    const kept = opts(["Workboard UX"], true);
    expect(kept[defaultActive(kept, "work")]).toMatchObject({ kind: "epic", name: "Workboard UX" });
  });

  it("starts at the top of the list before anything is typed", () => {
    expect(defaultActive(opts(["A", "B"], false), "")).toBe(0);
  });
});

describe("createEpicForCard (W.153, review P7)", () => {
  it("puts a saved card in the new epic at once, so creating and choosing is one step", async () => {
    const setEpic = vi.fn(async () => ({ ok: true as const }));
    const res = await createEpicForCard({ name: "Onboarding", cardId: "t1", create: async () => ({ ok: true, id: "e9" }), setEpic });
    expect(setEpic).toHaveBeenCalledWith("t1", "e9");
    expect(res).toEqual({ ok: true, epicId: "e9", saved: true });
  });

  it("leaves a new card's epic to the Create button, which has no card to write to yet", async () => {
    const setEpic = vi.fn(async () => ({ ok: true as const }));
    const res = await createEpicForCard({ name: "Onboarding", cardId: null, create: async () => ({ ok: true, id: "e9" }), setEpic });
    expect(setEpic).not.toHaveBeenCalled();
    expect(res).toEqual({ ok: true, epicId: "e9", saved: false });
  });

  it("keeps the new epic on the form when filing the card in it failed, so Save tries again", async () => {
    const res = await createEpicForCard({
      name: "Onboarding", cardId: "t1",
      create: async () => ({ ok: true, id: "e9" }),
      setEpic: async () => ({ ok: false, error: "nope" }),
    });
    expect(res).toEqual({ ok: true, epicId: "e9", saved: false });
  });

  it("passes on a refused create and files nothing", async () => {
    const setEpic = vi.fn();
    const res = await createEpicForCard({ name: "", cardId: "t1", create: async () => ({ ok: false, error: "Name the epic." }), setEpic });
    expect(res).toEqual({ ok: false, error: "Name the epic." });
    expect(setEpic).not.toHaveBeenCalled();
  });

  it("turns a create that threw into a message, so the picker never sticks on Creating", async () => {
    const res = await createEpicForCard({ name: "x", cardId: "t1", create: async () => { throw new Error("fetch failed"); }, setEpic: vi.fn() });
    expect(res).toEqual({ ok: false, error: "The epic could not be created. Try again." });
  });
});

import { describe, expect, it } from "vitest";
import {
  HANDOVER_WAIT_MS,
  PICK_DELAY_MS,
  TYPING_DELAY_MS,
  changedBy,
  delayFor,
  handoverPending,
  unsavedFields,
} from "./card-autosave";
import type { Form } from "./board-view-types";

// TH.3.2: what the drawer saves on its own and when. The server tidies what it
// stores, and a rule that compared raw values would save the tidied copy back,
// forever; those cases are pinned here.

const base: Form = {
  id: "c1",
  boardId: "b1",
  clientId: "internal",
  laneId: "To do",
  title: "Old",
  priority: "p3",
  assigneeId: "",
  origAssigneeId: "",
  handoverNote: "",
  dueDate: "",
  humanTokens: "1",
  origHumanTokens: "1",
  description: "",
  prUrl: "",
  buildSummary: "",
  sprintId: "",
  origSprintId: "",
  epicId: "",
  origEpicId: "",
  subjectType: null,
  subjectLabel: null,
  roadmapItemId: "",
  origRoadmapItemId: "",
  internal: false,
  origInternal: false,
};
const formWith = (patch: Partial<Form>): Form => ({ ...base, ...patch });

describe("unsavedFields", () => {
  it("names what differs from the server, and nothing else", () => {
    expect(unsavedFields(formWith({ title: "New", sprintId: "s1" }), base, {})).toEqual(["title", "sprintId"]);
    expect(unsavedFields(base, base, {})).toEqual([]);
  });

  it("does not count what the server only tidies: trimmed text, a snapped estimate, a full link", () => {
    const opened = formWith({ title: "Hello", description: "Notes", prUrl: "https://github.com/a/b/pull/1", humanTokens: "0.35", origHumanTokens: "0.35" });
    const typed = formWith({ title: "Hello ", description: "Notes\n", prUrl: "github.com/a/b/pull/1", humanTokens: "0.33", origHumanTokens: "0.35" });
    expect(unsavedFields(typed, opened, {})).toEqual([]);
  });

  it("never sends a blank title: the card keeps its old one until a new one is typed", () => {
    expect(unsavedFields(formWith({ title: "   " }), base, {})).toEqual([]);
  });

  it("leaves out a value just sent until the board's refresh brings it back", () => {
    expect(unsavedFields(formWith({ title: "New" }), base, { title: "New" })).toEqual([]);
    // Typed again since: unsaved again.
    expect(unsavedFields(formWith({ title: "Newer" }), base, { title: "New" })).toEqual(["title"]);
  });

  it("compares the estimate, sprint, epic, roadmap item and flag with their orig fields, which follow each write", () => {
    expect(unsavedFields(formWith({ sprintId: "s1", origSprintId: "s1" }), base, {})).toEqual([]);
    expect(unsavedFields(formWith({ humanTokens: "2", origHumanTokens: "1" }), base, {})).toEqual(["humanTokens"]);
  });
});

describe("handoverPending", () => {
  it("is a reassignment to somebody other than the person editing", () => {
    expect(handoverPending(formWith({ assigneeId: "p2" }), "p1")).toBe(true);
    expect(handoverPending(formWith({ assigneeId: "p1" }), "p1")).toBe(false);
    expect(handoverPending(formWith({ assigneeId: "", origAssigneeId: "p2" }), "p1")).toBe(false);
    expect(handoverPending(formWith({ id: null, assigneeId: "p2" }), "p1")).toBe(false);
  });
});

describe("delayFor", () => {
  it("saves a pick at once, waits for a pause in typing, and gives a handover time for its line", () => {
    expect(delayFor(["priority"], formWith({ priority: "p1" }), "p1")).toBe(PICK_DELAY_MS);
    expect(delayFor(["description"], formWith({ description: "x" }), "p1")).toBe(TYPING_DELAY_MS);
    expect(delayFor(["assigneeId"], formWith({ assigneeId: "p2" }), "p1")).toBe(HANDOVER_WAIT_MS);
    expect(delayFor(["assigneeId"], formWith({ assigneeId: "p1" }), "p1")).toBe(PICK_DELAY_MS);
  });
});

describe("changedBy", () => {
  it("lists the fields an edit changed, and nothing across two cards", () => {
    expect(changedBy(base, formWith({ title: "T", dueDate: "2026-10-12" }))).toEqual(["title", "dueDate"]);
    expect(changedBy(base, formWith({ id: "c2", title: "T" }))).toEqual([]);
    expect(changedBy(null, base)).toEqual([]);
  });
});

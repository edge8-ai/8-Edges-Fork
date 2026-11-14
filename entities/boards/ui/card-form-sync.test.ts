import { describe, expect, it } from "vitest";
import { resyncForm, sameForm } from "./card-form-sync";
import type { Form } from "./board-view-types";

// W.131. The open drawer after the live card changed under it: untouched
// fields follow the card, edited ones are kept, and orig* always follow.

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
  humanTokens: "0.3",
  origHumanTokens: "0.3",
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

describe("resyncForm", () => {
  it("shows the cleared estimate when the last sized subtask was cleared and the field was not touched", () => {
    const fresh = { ...base, humanTokens: "", origHumanTokens: "" };
    const out = resyncForm(base, base, fresh);
    expect(out.humanTokens).toBe("");
    expect(out.origHumanTokens).toBe("");
  });

  it("follows an untouched text field and keeps an edited one", () => {
    const form = { ...base, description: "My notes" };
    const fresh = { ...base, title: "Renamed elsewhere", description: "Their notes" };
    const out = resyncForm(form, base, fresh);
    expect(out.title).toBe("Renamed elsewhere");
    expect(out.description).toBe("My notes");
  });

  it("keeps an edited estimate but moves its orig to the live value, so Save still sends it", () => {
    const form = { ...base, humanTokens: "2" };
    const fresh = { ...base, humanTokens: "", origHumanTokens: "" };
    const out = resyncForm(form, base, fresh);
    expect(out.humanTokens).toBe("2");
    expect(out.origHumanTokens).toBe("");
  });

  it("keeps an edited assignee as a handover against the live one", () => {
    const form = { ...base, assigneeId: "p-mine" };
    const fresh = { ...base, assigneeId: "p-theirs", origAssigneeId: "p-theirs" };
    const out = resyncForm(form, base, fresh);
    expect(out.assigneeId).toBe("p-mine");
    expect(out.origAssigneeId).toBe("p-theirs");
  });

  it("moves orig* to the live value even when a save's fold already moved them (W.134)", () => {
    // A save folded the typed 0.5 into origHumanTokens; another writer then
    // set 0.7. The orig must say what the server holds now, so Save compares
    // against 0.7 — an orig that only followed "untouched" would stay 0.5.
    const opened = { ...base, humanTokens: "1", origHumanTokens: "1" };
    const form = { ...opened, humanTokens: "0.5", origHumanTokens: "0.5" };
    const fresh = { ...base, humanTokens: "0.7", origHumanTokens: "0.7" };
    const out = resyncForm(form, opened, fresh);
    expect(out.origHumanTokens).toBe("0.7");
    expect(out.humanTokens).toBe("0.5");
  });

  it("returns the same form when nothing changed, so no state is set", () => {
    expect(resyncForm(base, base, { ...base })).toBe(base);
    expect(sameForm(base, { ...base })).toBe(true);
    expect(sameForm(base, { ...base, title: "x" })).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { estimateToSave } from "./save-estimate";

// W.130. Broken in production: after a subtask was sized in the drawer, Save
// sent the drawer's stale copy of the parent's figure, the server refused it,
// and the title or description in the same save was lost.
describe("estimateToSave", () => {
  it("sends nothing when the field was not edited, whatever the server has done since", () => {
    expect(estimateToSave("1", "1", [])).toBeUndefined();
    expect(estimateToSave("", "", undefined)).toBeUndefined();
  });

  it("sends the typed figure when the field was edited", () => {
    expect(estimateToSave("1.25", "", [{ human_tokens: null }])).toBe(1.25);
    expect(estimateToSave("0.3", "1", undefined)).toBe(0.3);
  });

  it("sends null when the field was emptied, which clears the estimate", () => {
    expect(estimateToSave("", "0.3", [])).toBeNull();
  });

  it("sends nothing for a card whose subtasks decide its figure now, even after an edit", () => {
    expect(estimateToSave("2", "", [{ human_tokens: 0.3 }])).toBeUndefined();
  });
});

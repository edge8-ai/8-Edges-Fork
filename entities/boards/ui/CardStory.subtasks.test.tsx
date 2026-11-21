import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { WorkboardCard } from "@/entities/boards/lib/workboard";
import type { Form } from "./board-view-types";
import { CardStory } from "./CardStory";
import type { SubtaskOpener } from "./useSubtaskOpener";

// W.163 F12. The Details panel remounts when the History tab is shown and
// hidden, so whether "+ Subtask" opened the section, and what is typed in it,
// must come from the drawer above it. Drawn from what the drawer holds, a
// remounted panel shows the section still open with the text still in it.

const form = { id: "t1", boardId: "b1", title: "Rebuild the drawer", description: "", prUrl: "" } as unknown as Form;
const card = { id: "t1", board_id: "b1", title: "Rebuild the drawer", subtasks: [], comments: [], blockers: [] } as unknown as WorkboardCard;

function story(subtasks: SubtaskOpener) {
  return renderToStaticMarkup(
    <CardStory
      form={form}
      setForm={() => {}}
      activeCard={card}
      slug="build"
      readOnly={false}
      saving={false}
      run={() => {}}
      people={[]}
      subtasks={subtasks}
    />,
  );
}

describe("CardStory: the subtasks the drawer holds (W.163 F12)", () => {
  it("draws the section the drawer says is open, with the subtask typed into it", () => {
    const out = story({ opened: true, open: () => {}, draft: "Write the copy", setDraft: () => {} });
    expect(out).toContain('aria-label="Add a subtask"');
    expect(out).toContain('value="Write the copy"');
  });

  it("draws no empty section on a card whose section was never opened", () => {
    expect(story({ opened: false, open: () => {}, draft: "", setDraft: () => {} })).not.toContain('aria-label="Add a subtask"');
  });
});

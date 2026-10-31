import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Subtask } from "@/entities/boards/lib/data";
import { WorkboardSubtasksList, WorkboardSubtasksToggle, useWorkboardCardSubtasks } from "./WorkboardCardSubtasks";

// Bug hunt F15: the kanban's subtask expander counted "x/2" without the
// set-aside subtasks, but its tally and its list included them, so "1/2"
// could open on three rows. A static render is the expander as the board
// first draws it; the list is drawn open by handing it an open state.

const sub = (id: string, title: string, over: Partial<Subtask> = {}): Subtask => ({
  id,
  title,
  done: false,
  human_tokens: null,
  assignee_id: null,
  assignee_name: null,
  ...over,
});

const subtasks = [
  sub("s1", "Draft the copy", { done: true }),
  // Set aside AND marked done: the content sync can drop a post that was
  // ticked, and the old tally counted it as one of the owed ones done.
  sub("s2", "Dropped post", { setAside: true, done: true }),
  sub("s3", "Record the voice-over"),
];

function Expander({ rows, open }: { rows: Subtask[]; open: boolean }) {
  const state = useWorkboardCardSubtasks("c1", rows, () => {});
  return (
    <>
      <WorkboardSubtasksToggle state={state} cardTitle="Teaser video" />
      <WorkboardSubtasksList state={{ ...state, open }} subtasks={rows} saving={false} />
    </>
  );
}

describe("the kanban subtask expander (bug hunt F15)", () => {
  it("counts and tallies only the subtasks somebody still owes", () => {
    const out = renderToStaticMarkup(<Expander rows={subtasks} open={false} />);
    // Two owed, one of them done; the set-aside one is in neither number.
    expect(out).toContain("</svg> 1/2</button>");
    expect(out).toContain('aria-label="Show the 2 subtasks of Teaser video"');
  });

  it("lists the set-aside rows last, labelled, and not tickable", () => {
    const out = renderToStaticMarkup(<Expander rows={subtasks} open />);
    const draft = out.indexOf("Draft the copy");
    const voice = out.indexOf("Record the voice-over");
    const dropped = out.indexOf("Dropped post");
    expect(draft).toBeGreaterThan(-1);
    expect(voice).toBeGreaterThan(draft);
    expect(dropped).toBeGreaterThan(voice);
    const asideRow = out.slice(out.lastIndexOf("<li", dropped), out.indexOf("</li>", dropped));
    expect(asideRow).toContain("is-set-aside");
    expect(asideRow).toContain(">Set aside<");
    expect(asideRow).toContain('aria-label="Dropped post, set aside"');
    expect(asideRow).toContain("disabled");
    // The owed rows stay tickable.
    const draftRow = out.slice(out.lastIndexOf("<li", draft), out.indexOf("</li>", draft));
    expect(draftRow).not.toContain("disabled");
    expect(draftRow).not.toContain("Set aside");
  });

  // Review of W.163: with every subtask set aside the toggle read "0/0" and
  // "Show the 0 subtasks".
  it("names a card whose subtasks were all set aside instead of counting zero", () => {
    const out = renderToStaticMarkup(<Expander rows={[sub("s1", "Gone", { setAside: true }), sub("s2", "Also gone", { setAside: true })]} open={false} />);
    expect(out).toContain('aria-label="Show the 2 set-aside subtasks of Teaser video"');
    expect(out).toContain("</svg> Set aside</button>");
    expect(out).not.toContain("0/0");
  });

  it("says one subtask, not one subtasks", () => {
    const out = renderToStaticMarkup(<Expander rows={[sub("s1", "Only one")]} open={false} />);
    expect(out).toContain('aria-label="Show the 1 subtask of Teaser video"');
  });
});

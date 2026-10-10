import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// W.108. The List reads at rest and edits on click, grouped by lane.
//
// There is no @testing-library/react and no DOM environment in this repo, so
// a static render IS the resting state — exactly what a reader sees before
// they touch anything. The one thing a static render cannot do is click, so
// the "after click" case pins the single piece of state a click sets: the
// boolean `editing` that WorkboardListEdit and the board's own quick fields
// keep. `openEdits` flips every boolean useState in the tree to true, which
// is precisely what clicking every editable cell would do, and it leaves
// every other useState (the sort key, the sort direction) real.
let openEdits = false;
// The same trick reaches the sort, whose key is the view's one `useState(null)`:
// setting it is exactly what clicking a column header does.
let sortBy: string | null = null;
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (init: unknown) => {
      if (openEdits && init === false) return [true, () => {}];
      if (sortBy !== null && init === null) return [sortBy, () => {}];
      return (actual.useState as (i: unknown) => unknown)(init);
    },
  };
});

vi.mock("@/entities/boards/lib/actions", () => ({ updateCard: async () => ({ ok: true }) }));
vi.mock("@/entities/boards/lib/sprint-actions", () => ({ setCardSprint: async () => ({ ok: true }) }));
vi.mock("@/entities/boards/lib/token-actions", () => ({ setTaskTokens: async () => ({ ok: true }) }));
vi.mock("@/entities/boards/lib/move-to-board", () => ({ moveCardToBoard: async () => ({ ok: true }) }));
vi.mock("./undo-toast", () => ({ showMoveUndo: () => {} }));

import { WorkboardList } from "./WorkboardList";
import type { Card } from "./board-view-types";
import type { WorkboardData } from "@/entities/boards/lib/workboard";

// Invented people and boards: the public fork receives the test files too, so
// a real colleague's name in a fixture fails the fork scanner.
const card = (over: Partial<Card> = {}): Card =>
  ({
    id: "c1",
    title: "Rewire the kettle telemetry",
    columnId: "Doing",
    board_id: "b1",
    status: "doing",
    priority: "p2",
    assignee_id: "p1",
    assignee_name: "Rowan Quill",
    sprint_id: "s1",
    human_tokens: 0.3,
    due_date: "2026-09-22",
    subtasks: [],
    blockers: [],
    ...over,
  }) as unknown as Card;

const data = (cards: Card[]): WorkboardData =>
  ({
    boards: [{ id: "b1", name: "Kettle Works", slug: "kettle", client_name: "Kettle Works", client_company_id: "cc1", client_color: 1 }],
    lanes: [
      { id: "Doing", name: "Doing", isDone: false, wipLimit: null },
      { id: "Done", name: "Done", isDone: true, wipLimit: null },
    ],
    sprints: [{ id: "s1", board_id: "b1", name: "Sprint 9 - Kettles And Cabling", status: "active" }],
    people: [{ id: "p1", name: "Rowan Quill" }],
    epics: [],
    clients: [{ id: "cc1", name: "Kettle Works" }],
    cards,
  }) as unknown as WorkboardData;

const html = (cards: Card[], canEdit = true) => {
  openEdits = false;
  sortBy = null;
  return renderToStaticMarkup(
    <WorkboardList data={data(cards)} cards={cards} canEdit={canEdit} filtersActive={false} saving={false} run={() => {}} onOpen={() => {}} />,
  );
};

describe("WorkboardList at rest (W.108)", () => {
  it("groups the rows by lane and heads each group with the lane's badge and count", () => {
    // The group IS the status, which is why there is no Status column: a
    // column repeating the badge above it would carry one fact twice.
    const out = html([card(), card({ id: "c2", columnId: "Done", status: "done", title: "Ship the cabling" })]);
    expect(out).toContain("wb-list-group");
    expect(out).toContain("wb-col-badge");
    expect(out).toContain('class="wb-list-group-count">1<');
    expect(out).not.toContain(">Status<");
  });

  it("draws no form control anywhere before anything is clicked", () => {
    const out = html([card()]);
    expect(out).not.toContain("<select");
    expect(out).not.toContain('type="date"');
    expect(out).not.toContain('type="number"');
  });

  it("gives a read-only surface the plain text and no affordance at all", () => {
    const out = html([card()], false);
    expect(out).not.toContain("<select");
    expect(out).not.toContain("wb-list-edit");
    expect(out).toContain("Rowan Quill");
  });

  it("prints an empty cell as the dash, never as a date placeholder", () => {
    const out = html([card({ human_tokens: null, due_date: null, sprint_id: null })]);
    expect(out).toContain("wb-list-dash");
    expect(out).not.toContain("dd/mm/yyyy");
  });

  // W.175: the date in the card face's words, with no year (ListDue).
  it("reads a date the way the card face does and a sprint through its short name", () => {
    const out = html([card()]);
    expect(out).toContain(">Tue 22 Sep<");
    expect(out).not.toContain("2026");
    expect(out).toContain("Sprint 9");
    // The theme is what the sprint is FOR, which belongs on the sprint page
    // and in the hover, not stretching a column on forty rows (W.103.2).
    expect(out).not.toContain(">Sprint 9 - Kettles And Cabling<");
    expect(out).toContain('title="Sprint 9 - Kettles And Cabling"');
  });

  it("keeps the title to one line with the whole of it in the hover", () => {
    const out = html([card()]);
    expect(out).toContain('title="Rewire the kettle telemetry"');
    expect(out).toContain("wb-list-cell-title");
  });

  it("says priority in weight, not in hue (W.48)", () => {
    expect(html([card({ priority: "p1" })])).toContain('class="wb-list-pri is-high">P1<');
    expect(html([card()])).toContain('class="wb-list-pri">P2<');
    expect(html([card()])).not.toContain("admin-badge");
  });
});

describe("WorkboardList on click (W.108)", () => {
  it("swaps the clicked cells into their controls", () => {
    const cards = [card()];
    openEdits = true;
    const out = renderToStaticMarkup(
      <WorkboardList data={data(cards)} cards={cards} canEdit filtersActive={false} saving={false} run={() => {}} onOpen={() => {}} />,
    );
    openEdits = false;
    expect(out).toContain('aria-label="Sprint"');
    expect(out).toContain('aria-label="Due date"');
    expect(out).toContain('aria-label="Human Tokens"');
    expect(out).toContain("<select");
  });
});

describe("WorkboardList sorting (W.108)", () => {
  it("sorts within a group and never across the lanes", () => {
    // The grouping is the outer order; a sort that reordered the lanes would
    // answer a question nobody asked. Sorted by title the two Doing cards swap
    // places, and "Alloy" — first of the three alphabetically — still comes
    // last, because it is in the other lane.
    const cards = [
      card({ id: "a", columnId: "Doing", title: "Zinc" }),
      card({ id: "b", columnId: "Done", status: "done", title: "Alloy" }),
      card({ id: "c", columnId: "Doing", title: "Anvil" }),
    ];
    expect(html(cards).indexOf("Zinc")).toBeLessThan(html(cards).indexOf("Anvil"));
    sortBy = "title";
    const out = renderToStaticMarkup(
      <WorkboardList data={data(cards)} cards={cards} canEdit filtersActive={false} saving={false} run={() => {}} onOpen={() => {}} />,
    );
    sortBy = null;
    expect(out.indexOf("Anvil")).toBeLessThan(out.indexOf("Zinc"));
    expect(out.indexOf("Zinc")).toBeLessThan(out.indexOf("Alloy"));
  });
});

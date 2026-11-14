import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { KanbanBoard, type KanbanColumn } from "@/kernel/ui/KanbanBoard";
import type { Card } from "./board-view-types";
import type { WorkboardMoveState } from "./useWorkboardDrag";
import { useWorkboardColumnSlots } from "./useWorkboardColumnSlots";

// W.114. To do's "This sprint" label pushed that lane's first card below
// Doing's and Waiting's, so no row of the board lined up across the lanes.
// The lanes without labels now keep an empty label's worth of space at the
// top while any other lane draws one — and only then, so a board with no
// sections gains nothing.

const columns: KanbanColumn[] = [
  { id: "To do", label: "To do" },
  { id: "Doing", label: "Doing" },
];

const card = (id: string, columnId: string, sprint_id: string | null, due_date: string | null = null) =>
  ({ id, title: id, columnId, sprint_id, due_date }) as unknown as Card;

const moveState = { pending: {}, landedLane: null } as unknown as WorkboardMoveState;

function Probe({ cards }: { cards: Card[] }) {
  const slots = useWorkboardColumnSlots({
    columns,
    cards,
    moveState,
    collapsedColumns: [],
    phoneColumnId: "To do",
    doneColumnIds: new Set(),
    todoColumnId: "To do",
    doneWindowLabel: null,
    doneGrouped: false,
    sprintIds: new Set(["s1"]),
    today: "2026-09-23",
    wipLimits: new Map(),
    manualOrder: true,
    sort: "manual" as never,
    canAdd: false,
    filtersActive: false,
    saving: false,
    onReorder: () => {},
    onToggleColumn: () => {},
    closedColumnIds: new Set(),
    onShowAllIn: () => {},
    onAddCard: () => {},
  });
  return <KanbanBoard columns={columns} cards={cards} onMove={() => {}} cardSections={slots.cardSections} renderCard={(c) => <span>{c.title}</span>} />;
}

// The markup of one lane, from its head to the next lane's head.
function lane(html: string, label: string) {
  const start = html.indexOf(`>${label}<`);
  const after = columns.map((c) => html.indexOf(`>${c.label}<`)).filter((i) => i > start);
  return html.slice(start, after.length > 0 ? Math.min(...after) : undefined);
}

const SLOT = 'aria-hidden="true">\u00a0</span>';

describe("the lane label slot (W.114)", () => {
  it("keeps a label's space at the top of a lane without labels while another lane draws one", () => {
    const html = renderToStaticMarkup(<Probe cards={[card("sprint-card", "To do", "s1"), card("backlog-card", "To do", null), card("doing-card", "Doing", "s1")]} />);
    expect(lane(html, "To do")).toContain("This sprint");
    const doing = lane(html, "Doing");
    expect(doing).toContain(SLOT);
    // Above the card, not below it: the slot is what lines the first row up.
    expect(doing.indexOf(SLOT)).toBeLessThan(doing.indexOf("doing-card"));
  });

  it("adds nothing when no lane is sectioned", () => {
    const html = renderToStaticMarkup(<Probe cards={[card("a", "To do", "s1"), card("b", "Doing", "s1")]} />);
    expect(html).not.toContain(SLOT);
  });

  it("adds nothing to an empty lane, which has no first card to line up", () => {
    const html = renderToStaticMarkup(<Probe cards={[card("sprint-card", "To do", "s1"), card("backlog-card", "To do", null)]} />);
    expect(lane(html, "Doing")).not.toContain(SLOT);
  });
});

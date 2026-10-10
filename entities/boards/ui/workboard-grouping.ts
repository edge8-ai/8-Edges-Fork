import { PRIORITY_LABEL, TASK_PRIORITIES, type EpicRow, type SprintRow, type TaskPriority } from "@/entities/boards/lib/types";
import type { WorkboardData, WorkboardLane } from "@/entities/boards/lib/workboard";
import type { KanbanColumn } from "@/kernel/ui/KanbanBoard";
import { STAGE_LOST, STAGE_WON, STAGE_NEUTRAL, STAGE_LEAD, STAGE_PROPOSAL, STAGE_DISCOVERY, STAGE_CONTRACT } from "@/kernel/ui/stageColors";
import type { GroupingId } from "./workboard-filter-params";

// What the board's columns STAND FOR (W.25). The columns were hardwired to the
// lanes, so the only question the board could answer was "what is in Review".
// "What is open in Commerce & Billing", "what is P1 across every client" and
// "what has Dave got" had no answer short of filtering six times and counting.
//
// A grouping is two pure functions — the columns it produces and the column a
// card belongs to — plus the field a drop into one of its columns writes. That
// last part is the expensive half: dropping a card into the "Commerce &
// Billing" column has to SET the epic, and where it cannot (a client, which a
// card inherits from its board) the board must say so rather than let the card
// spring back and look broken.
//
// Assignee is one of the five on purpose (Khoa, 2026-09-17). It is a view you
// pick to FIND cards, never a figure the system computes about a person: a
// person's column shows the same card count every other column shows and
// nothing more, which is why nothing here aggregates, scores or ranks by
// person — see the no-metric-describes-a-person rule in CLAUDE.md.

export const GROUPING_LABEL: Record<GroupingId, string> = {
  lane: "Status",
  epic: "Epic",
  client: "Client",
  priority: "Priority",
  sprint: "Sprint",
  assignee: "Assignee",
};

// The column for cards that have no value at all under this grouping, spelled
// the way the filters already spell the same three ideas in the URL.
export const NO_GROUP = "none";
export const UNASSIGNED = "unassigned";
export const INTERNAL = "internal";

// The lane accents, as they were in WorkboardKanban before grouping moved
// column-building here: the done lane always reads as done, the rest cycle so
// neighbouring columns never share one.
const NONDONE_ACCENTS = [STAGE_NEUTRAL, STAGE_LEAD, STAGE_PROPOSAL, STAGE_DISCOVERY, STAGE_CONTRACT];

// The shape each grouping reads. A card, narrowed to the fields a grouping
// asks about, plus the lane the board has placed it in.
export type GroupableCard = {
  id: string;
  columnId: string;
  board_id: string | null;
  epic_id: string | null;
  sprint_id: string | null;
  assignee_id: string | null;
  priority: TaskPriority;
};

// The rows the groupings name their columns from.
export type GroupingVocabulary = {
  lanes: WorkboardLane[];
  epics: EpicRow[];
  sprints: SprintRow[];
  clients: { id: string; name: string }[];
  people: { id: string; name: string }[];
  /** Each board's client company, so a card's client is its board's client. */
  boardClient: Map<string, string | null>;
};

/**
 * The board's rows, narrowed to what the groupings name their columns from.
 * Only the ACTIVE epics group the board: a card still carrying an archived one
 * falls into "No epic" rather than resurrecting a column for it.
 */
export function groupingVocabulary(data: WorkboardData): GroupingVocabulary {
  return {
    lanes: data.lanes,
    epics: data.epics.filter((e) => e.status === "active"),
    sprints: data.sprints,
    clients: data.clients,
    people: data.people.map((p) => ({ id: p.id, name: p.name })),
    boardClient: new Map(data.boards.map((b) => [b.id, b.client_company_id])),
  };
}

/**
 * The column a card belongs to under this grouping. It is the one place a card
 * is mapped onto a column, so the picture and the drop cannot disagree about
 * which column a card is already in.
 */
export function cardGroupId(card: GroupableCard, grouping: GroupingId, v: GroupingVocabulary): string {
  switch (grouping) {
    case "lane":
      return card.columnId;
    case "epic":
      return card.epic_id ?? NO_GROUP;
    case "sprint":
      return card.sprint_id ?? NO_GROUP;
    case "assignee":
      return card.assignee_id ?? UNASSIGNED;
    case "priority":
      return card.priority;
    case "client":
      return v.boardClient.get(card.board_id ?? "") ?? INTERNAL;
  }
}

/**
 * The columns this grouping draws, in the board's own order.
 *
 * Lanes and priorities render in full, empty or not: there are four lanes and
 * three priorities, each is a drop target, and a board with nothing in Review
 * still has a Review. Every other grouping renders only the groups that have a
 * card in view — Dave re-founded epics as 23 permanent product domains on
 * 2026-09-18, so a board grouped by epic would otherwise be twenty empty
 * columns and two full ones. The cost is real and accepted: you cannot drop a
 * card into an epic that has no card yet, and the card drawer is where that
 * belongs.
 */
export function groupColumns(grouping: GroupingId, cards: GroupableCard[], v: GroupingVocabulary): KanbanColumn[] {
  if (grouping === "lane") {
    let nd = 0;
    return v.lanes.map((l) => ({ id: l.id, label: l.name, accent: l.isDone ? STAGE_WON : l.isNotDoing ? STAGE_LOST : NONDONE_ACCENTS[nd++ % NONDONE_ACCENTS.length] }));
  }
  if (grouping === "priority") {
    return TASK_PRIORITIES.map((p) => ({ id: p, label: PRIORITY_LABEL[p] }));
  }
  const present = new Set(cards.map((c) => cardGroupId(c, grouping, v)));
  const keep = (columns: KanbanColumn[]) => columns.filter((c) => present.has(c.id));
  switch (grouping) {
    case "epic":
      // An epic's own colour is the column's accent, which is why grouping by
      // epic came free of a palette decision; the accent paints the column and
      // never the cards in it (W.48).
      return keep([
        ...v.epics.map((e) => ({ id: e.id, label: e.name, accent: e.color ?? undefined })),
        { id: NO_GROUP, label: "No epic" },
      ]);
    case "sprint":
      return keep([...v.sprints.map((s) => ({ id: s.id, label: s.name })), { id: NO_GROUP, label: "Backlog" }]);
    case "assignee":
      return keep([...v.people.map((p) => ({ id: p.id, label: p.name })), { id: UNASSIGNED, label: "Unassigned" }]);
    case "client":
      return keep([...v.clients.map((c) => ({ id: c.id, label: c.name })), { id: INTERNAL, label: "Internal" }]);
  }
}

/**
 * The card field a drop into one of this grouping's columns writes, or null
 * where a drop cannot be honoured at all.
 *
 * Client is the null: a card's client is its board's client, so "make this an
 * Acme card" means moving the card to an Acme board — a different act, with a
 * board to choose, which the card drawer already offers. The board says that in
 * words rather than accepting the drag and reverting it.
 */
export function groupDropField(grouping: GroupingId): "lane" | "epic" | "sprint" | "assignee" | "priority" | null {
  return grouping === "client" ? null : grouping;
}

/** Why a drop into this grouping's columns cannot be honoured; null when it can. */
export function groupDropRefusal(grouping: GroupingId): string | null {
  return grouping === "client"
    ? "A card's client comes from its board, so it can't be dragged between clients. Open the card and move it to another board instead."
    : null;
}

/**
 * The groupings this scope can offer.
 *
 * Epic is the one that is gated: epics are board-scoped (W.41, confirmed
 * 2026-09-18), so across boards two boards may each have a "Commerce &
 * Billing" and they are different epics — stacking them side by side would
 * give duplicate names and colliding colours. It is offered on one board only,
 * exactly as the epic PICKER used to be gated before W.37 widened it.
 */
export function availableGroupings(v: GroupingVocabulary, single: boolean): GroupingId[] {
  const out: GroupingId[] = ["lane"];
  if (single && v.epics.length > 0) out.push("epic");
  // One client — or one client and nothing else — is not something to group by.
  // Internal boards count as a client here, because "Internal" is a column.
  if (new Set([...v.boardClient.values()].map((c) => c ?? INTERNAL)).size > 1) out.push("client");
  out.push("priority");
  if (v.sprints.length > 0) out.push("sprint");
  out.push("assignee");
  return out;
}

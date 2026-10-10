// How one task row becomes a card on a workboard (W.151).
//
// getWorkboard reads every table a board needs in two rounds; what a single
// card looks like once those reads are in — its lane, its status as the lane
// shows it, the names behind its ids, its subtasks, blockers and comments —
// is this file. It moved out of workboard.ts because that loader had reached
// its size cap and the card itself is the part that keeps growing: the
// deliverables count (W.158) is the next fact a card carries.
import { laneStatus } from "./workboard-lanes";
import { SOURCE_AGENT, type BoardColumnRow, type TaskRow } from "./types";
import type { splitCardChildren } from "./workboard-children";
import type { TaskComment } from "./data";
import type { WorkboardCard } from "./workboard";

/** Everything a card is shaped from, resolved once for the whole board. */
export type CardShapeContext = {
  columnById: ReadonlyMap<string, BoardColumnRow>;
  nameById: ReadonlyMap<string, string | null>;
  subjectLabel: ReadonlyMap<string, string>;
  children: ReturnType<typeof splitCardChildren>;
  /** Titles of the cards in scope, so a blocker can only link to one the reader can see. */
  cardTitle: ReadonlyMap<string, string>;
  commentsByTask: ReadonlyMap<string, TaskComment[]>;
  commentsFailed: boolean;
  lastMove: ReadonlyMap<string, string>;
  /** Live deliverables per card (W.158); null on a client-safe read or a failed one. */
  deliverableCount?: ReadonlyMap<string, number> | null;
  firstLane: string;
  clientSafe: boolean;
};

export function shapeCard(t: TaskRow, ctx: CardShapeContext): WorkboardCard {
  const { subtasksByParent, blockersByParent, blocksCount } = ctx.children;
  const card: WorkboardCard = {
    ...t,
    status: laneStatus(t.status, t.board_column_id ? ctx.columnById.get(t.board_column_id) : undefined), // W.111
    assignee_name: t.assignee_id ? ctx.nameById.get(t.assignee_id) ?? null : null,
    created_by_name: t.created_by ? ctx.nameById.get(t.created_by) ?? null : null,
    subject_label: t.subject_id ? ctx.subjectLabel.get(t.subject_id) ?? null : null,
    agent: (t.metadata as { source?: string } | null)?.source === SOURCE_AGENT,
    subtasks: (subtasksByParent.get(t.id) ?? []).map((s) => ({ ...s, assignee_name: s.assignee_id ? ctx.nameById.get(s.assignee_id) ?? null : null })),
    blockers: (blockersByParent.get(t.id) ?? []).map(({ blocked_by_task_id, ...b }) => ({
      ...b,
      assignee_name: b.assignee_id ? ctx.nameById.get(b.assignee_id) ?? null : null,
      // Null when no card was named AND when the named card is out of this
      // scope — the reader gets a link it can follow or nothing, never a
      // dangling id it would have to render as a broken one.
      blocked_by:
        blocked_by_task_id && ctx.cardTitle.has(blocked_by_task_id)
          ? { id: blocked_by_task_id, title: ctx.cardTitle.get(blocked_by_task_id) as string }
          : null,
    })),
    blocks: blocksCount.get(t.id) ?? 0,
    comments: ctx.commentsByTask.get(t.id) ?? [],
    ...(ctx.commentsFailed ? { comments_error: "Comments could not be loaded. Reload to try again." } : {}),
    last_moved_at: ctx.lastMove.get(t.id) ?? t.created_at,
    last_column_move_at: ctx.lastMove.get(t.id) ?? null,
    laneId: (t.board_column_id && ctx.columnById.get(t.board_column_id)?.name) || ctx.firstLane,
    ...(ctx.deliverableCount ? { deliverable_count: ctx.deliverableCount.get(t.id) ?? 0 } : {}),
  };
  // The client sees the card, not the team's working notes on it.
  return ctx.clientSafe ? clientSafeCard(card) : card;
}

// What a client may see of a card: the title, where it sits, who has it, how
// big it is and when it is due. Never the description, comments, subtasks,
// link labels or metadata, which are the team's working notes.
export function clientSafeCard(card: WorkboardCard): WorkboardCard {
  return {
    ...card,
    description: null,
    comments: [],
    subtasks: [],
    blockers: [],
    // A client sees the card, not what the team is waiting on to deliver it.
    blocks: 0,
    subject_type: null,
    subject_id: null,
    subject_label: null,
    metadata: {},
    // Deliverables are team only (W.158): not even their number.
    deliverable_count: undefined,
  };
}

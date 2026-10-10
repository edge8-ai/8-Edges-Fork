// A card's children, sorted into what they are.
//
// Every child task is either a subtask or a blocker — a blocker is a child
// flagged `metadata.kind === "blocker"` (BL-01: its body is the title, the
// person it is tagged to is the assignee, and "resolved" is the done status).
// Telling them apart, and counting what each blocker points at, is one job
// and it is this file's. Split out of workboard.ts for the file-size gate
// when W.56 gave a blocker a card to name.
//
// Nothing here resolves a NAME: the tag's person and the named card's title
// are looked up once, later, against the people and cards already in scope.

import type { TaskRow } from "./types";

// Structurally the `Subtask` in data.ts. Declared here rather than imported
// because data.ts reaches getWorkboard, and importing back into it would put
// a cycle in the entity's own graph (import/no-cycle is an error).
export type ChildSubtask = { id: string; title: string; done: boolean; setAside: boolean; human_tokens: number | null; assignee_id: string | null };

/** A blocker before its tag name and its named card's title are resolved. */
export type RawBlocker = {
  id: string;
  body: string;
  assignee_id: string | null;
  resolved: boolean;
  /** The card this blocker is waiting on (W.56), or null. One link, never a schedule. */
  blocked_by_task_id: string | null;
};

export type CardChildren = {
  subtasksByParent: Map<string, ChildSubtask[]>;
  blockersByParent: Map<string, RawBlocker[]>;
  /** Distinct people tagged on a blocker, for the one people read. */
  blockerAssigneeIds: string[];
  /**
   * How many OPEN blockers name each card (W.56), so the card that IS the
   * thing being waited on can say "blocks 2". Resolved blockers do not count:
   * nobody is waiting any more.
   */
  blocksCount: Map<string, number>;
};

export function splitCardChildren(tasks: Pick<TaskRow, "id" | "title" | "status" | "assignee_id" | "human_tokens" | "parent_task_id" | "metadata">[]): CardChildren {
  const subtasksByParent = new Map<string, ChildSubtask[]>();
  const blockersByParent = new Map<string, RawBlocker[]>();
  const blockerAssigneeIds: string[] = [];
  const blocksCount = new Map<string, number>();

  for (const c of tasks) {
    if (!c.parent_task_id) continue;
    if ((c.metadata as { kind?: string } | null)?.kind === "blocker") {
      // jsonb carries no constraint, so anything that is not a non-empty
      // string reads as "no card named" rather than as a dangling link.
      const named = (c.metadata as { blocked_by_task_id?: unknown } | null)?.blocked_by_task_id;
      const blockedBy = typeof named === "string" && named ? named : null;
      const resolved = c.status !== "open";
      const list = blockersByParent.get(c.parent_task_id) ?? [];
      list.push({ id: c.id, body: c.title, assignee_id: c.assignee_id, resolved, blocked_by_task_id: blockedBy });
      blockersByParent.set(c.parent_task_id, list);
      if (blockedBy && !resolved) blocksCount.set(blockedBy, (blocksCount.get(blockedBy) ?? 0) + 1);
      if (c.assignee_id) blockerAssigneeIds.push(c.assignee_id);
      continue;
    }
    const list = subtasksByParent.get(c.parent_task_id) ?? [];
    // The assignee id travels; the NAME is resolved later against the people
    // already in scope, the same way a blocker's tag is. A subtask shown
    // inline on the board (W.92.7) needs an avatar, and re-reading people for
    // one would be a second query for a fact this row already carries.
    list.push({ id: c.id, title: c.title, done: c.status === "done", setAside: c.status === "not_doing", human_tokens: c.human_tokens, assignee_id: c.assignee_id });
    subtasksByParent.set(c.parent_task_id, list);
  }

  return { subtasksByParent, blockersByParent, blockerAssigneeIds, blocksCount };
}

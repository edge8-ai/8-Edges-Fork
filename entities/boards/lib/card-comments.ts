import type { TaskComment } from "./data";

// The comment rows the Workboard read selects, and how they become the
// TaskComment each card carries (W.143). Lifted out of workboard.ts, which sits
// at the file-size cap, when threads, resolve and mentions widened the row.

export const COMMENT_SELECT =
  "id, task_id, author_label, body, created_at, parent_comment_id, resolved_at, resolved_by_label, mentions";

export type CommentRow = {
  id: string;
  task_id: string;
  author_label: string;
  body: string;
  created_at: string;
  parent_comment_id?: string | null;
  resolved_at?: string | null;
  resolved_by_label?: string | null;
  mentions?: string[] | null;
};

/**
 * Groups comment rows by card, in the order the read returned them (oldest
 * first). A mention is named from `nameById`, the people the read already
 * resolved: everyone the picker offered is in it, because the picker offers
 * exactly those people. A mention of someone no longer in scope keeps its id
 * out of the list rather than inventing a name, and the comment's own text
 * still says "@Name", so nothing the author wrote is lost — only the highlight.
 */
export function groupComments(rows: CommentRow[], nameById: ReadonlyMap<string, string | null>): Map<string, TaskComment[]> {
  const byTask = new Map<string, TaskComment[]>();
  for (const c of rows) {
    const list = byTask.get(c.task_id) ?? [];
    list.push({
      id: c.id,
      author: c.author_label,
      body: c.body,
      createdAt: c.created_at,
      parentId: c.parent_comment_id ?? null,
      resolvedAt: c.resolved_at ?? null,
      resolvedBy: c.resolved_by_label ?? null,
      mentions: (c.mentions ?? []).flatMap((id) => {
        const name = nameById.get(id);
        return name ? [{ id, name }] : [];
      }),
    });
    byTask.set(c.task_id, list);
  }
  return byTask;
}

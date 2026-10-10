// The shape a record's history has once it has left the database, and the
// wording a screen puts on it. It lives apart from reads.ts because the panel
// that renders these entries is a browser component and reads.ts opens a
// service-role Supabase client: a "use client" file may name this module, and
// must never name that one.

/** One row of company_os.audit_log, with the actor already resolved to a name. */
export type AuditEntry = {
  id: string;
  /** ISO timestamp of the change (audit_log.changed_at). */
  at: string;
  /** The write that happened: insert, update, archive, restore, delete, bulk_*. */
  operation: string;
  /**
   * Who did it, as a person's name where the actor could be resolved to one,
   * else whatever the writer stored (usually an admin email, sometimes a
   * routine's name), else null for a change with no recorded actor.
   */
  actor: string | null;
  /** The writer's own note about the change — free-form, never a schema. */
  context: Record<string, unknown>;
  /**
   * The row before and after the write, present only when the reader asked for
   * them (`listAuditFor(..., { withData: true })`): a surface that names the
   * values that changed. Null when the writer stored none.
   */
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
};

/** One page of a record's history. `hasMore` answers whether another page exists. */
export type AuditPage = {
  entries: AuditEntry[];
  hasMore: boolean;
};

/**
 * What a surface's history action hands back. It follows the actions' Result
 * convention rather than throwing, because the panel that asks for it is a
 * drawer tab: a failed read should say so in the tab, not take the drawer down.
 */
export type AuditPageResult = { ok: true; page: AuditPage } | { ok: false; error: string };

const OPERATION_WORDS: Record<string, string> = {
  insert: "Created",
  update: "Updated",
  archive: "Archived",
  restore: "Restored",
  delete: "Deleted",
  bulk_update: "Updated in bulk",
  bulk_archive: "Archived in bulk",
  bulk_delete: "Deleted in bulk",
  read: "Viewed",
};

/**
 * The sentence a history row reads as. An operation the map does not know is
 * shown as the stored word rather than swallowed, because a new operation
 * reaching a screen unlabelled is a smaller failure than a row that vanishes.
 */
export function describeAuditOperation(operation: string): string {
  return OPERATION_WORDS[operation] ?? operation.replace(/_/g, " ");
}

/**
 * The short line under a history row: the fields the writer named in its
 * context, when it named any. The context is free-form, so only scalars are
 * shown and only a handful of them — a history row is a timeline entry, not a
 * diff viewer.
 */
export function summarizeAuditContext(context: Record<string, unknown>): string | null {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(context)) {
    if (value === null || value === undefined || value === "") continue;
    if (typeof value === "object") continue;
    parts.push(`${key.replace(/_/g, " ")} ${String(value)}`);
    if (parts.length >= 4) break;
  }
  return parts.length ? parts.join(" · ") : null;
}

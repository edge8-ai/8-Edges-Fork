"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatDate } from "./format";
import {
  describeAuditOperation,
  summarizeAuditContext,
  type AuditEntry,
  type AuditPageResult,
} from "@/kernel/audit/history";

// The one screen a record's audit trail reaches (S.4). The OS has written
// company_os.audit_log since the beginning; until this panel there was no way
// to see any of it.
//
// House rule, and the reason this takes one record's entries and nothing else:
// it answers what happened to this record, never what a person has been doing.
// There is no actor filter and no total by actor, here or anywhere.

/**
 * The rows themselves, with no loading of its own: a server page that already
 * has the entries renders this directly, and `RecordHistory` wraps it for a
 * drawer that must fetch them.
 */
export function RecordHistoryList({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) {
    return <div className="admin-empty">Nothing recorded for this record yet.</div>;
  }
  return (
    <div className="admin-list">
      {entries.map((e) => {
        const context = summarizeAuditContext(e.context);
        return (
          <div key={e.id} className="admin-list-row">
            <div className="admin-list-main">
              <div className="admin-list-title">
                {describeAuditOperation(e.operation)}
                {e.actor && <span className="admin-cell-muted"> · {e.actor}</span>}
              </div>
              {context && <div className="admin-list-sub">{context}</div>}
            </div>
            <div className="admin-list-aside">
              <span className="admin-list-sub">{formatDate(e.at)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The History panel for a drawer: it loads its first page when it mounts, and
 * `DetailDrawer` renders only the open tab's panel, so nothing is read until
 * somebody asks for the history.
 *
 * `load` is the caller's own server action, because the guard belongs to the
 * surface — an admin shelf gates on requireAdmin, a board on boardActorFor —
 * and the kernel has no business choosing which.
 */
/**
 * One page of history, with a load that throws (a guard refusing, the network
 * dropping) answered as the failure it is. Without it the panel waited for a
 * result that never came and stayed on "Loading…" (S.19.14).
 */
export async function settledPage(
  load: (offset: number, limit: number) => Promise<AuditPageResult>,
  offset: number,
  limit: number,
): Promise<AuditPageResult> {
  try {
    return await load(offset, limit);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "the request did not complete" };
  }
}

export function RecordHistory({
  load,
  pageSize = 20,
}: {
  load: (offset: number, limit: number) => Promise<AuditPageResult>;
  pageSize?: number;
}) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Held in a ref so the first-page effect does not re-run — and re-read the
  // whole history — every time the parent re-renders with a fresh closure.
  // Callers pass `(offset, limit) => someAction(id, offset, limit)` inline, and
  // that arrow is a new function on every render. A drawer keyed on the record
  // is what makes a *different* record load: the panel remounts with it.
  const loadRef = useRef(load);
  loadRef.current = load;

  const fetchPage = useCallback(
    async (offset: number) => {
      setBusy(true);
      const result = await settledPage(loadRef.current, offset, pageSize);
      if (result.ok) {
        // Appending rather than replacing is what makes "Show more" a page and
        // not a jump: offset 0 is the mount, every later call adds to the end.
        setEntries((current) => (offset === 0 ? result.page.entries : [...current, ...result.page.entries]));
        setHasMore(result.page.hasMore);
        setError(null);
      } else {
        setError(result.error);
      }
      setBusy(false);
    },
    [pageSize],
  );

  useEffect(() => {
    void fetchPage(0);
  }, [fetchPage]);

  // Styled as the failure it is: an empty-state look would read as "nothing
  // recorded", which is a different answer.
  if (error) return <div className="admin-alert admin-alert--err">History could not be read: {error}</div>;
  if (busy && entries.length === 0) return <div className="admin-cell-muted">Loading…</div>;

  return (
    <>
      <RecordHistoryList entries={entries} />
      {hasMore && (
        <button type="button" className="admin-btn u-mt-3" disabled={busy} onClick={() => void fetchPage(entries.length)}>
          {busy ? "Loading…" : "Show more"}
        </button>
      )}
    </>
  );
}

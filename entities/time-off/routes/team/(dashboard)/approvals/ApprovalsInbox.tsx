"use client";

// The approvals inbox's list (Z.2.1): three tabs over one set of rows (All,
// Named on me, My roles), a Details toggle per row, and leave decided in its
// row. The decide action arrives as a prop, because a route's action file may
// not be imported by shared UI and the page is where the guard lives.
//
// Every piece of state lives here, not in a tab's panel: kernel/ui/Tabs
// reuses one panel position for every tab, so state kept inside a panel would
// leak from the tab left into the tab opened. A row decided here leaves all
// three tabs at once and joins "Decided just now", which outlives the refresh
// that drops it from the server's list.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Result } from "@/kernel/data/result";
import { Badge } from "@/kernel/ui/Badge";
import { Tabs } from "@/kernel/ui/Tabs";
import { ApprovalRow, type InboxEntry } from "./ApprovalRow";

export type { InboxEntry };

type Decision = "approved" | "rejected";
type Decided = { id: string; title: string; decision: Decision };

const EMPTY = "Nothing is waiting here. When a draft or a request names you or one of your roles, it appears in this list.";

export function ApprovalsInbox({
  entries,
  decide,
}: {
  entries: InboxEntry[];
  decide: (id: string, decision: Decision) => Promise<Result>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [decided, setDecided] = useState<Decided[]>([]);

  const gone = new Set(decided.map((d) => d.id));
  const waiting = entries.filter((e) => !gone.has(e.id));
  const mine = waiting.filter((e) => e.namedOnMe);
  const roles = waiting.filter((e) => !e.namedOnMe);

  const act = (entry: InboxEntry, decision: Decision) =>
    start(async () => {
      const r = await decide(entry.subjectId, decision);
      setError(r.ok ? null : r.error);
      if (r.ok) setDecided((d) => [...d, { id: entry.id, title: entry.title, decision }]);
      router.refresh();
    });

  const list = (rows: InboxEntry[]) =>
    rows.length === 0 ? (
      <p className="admin-approvals-empty">{EMPTY}</p>
    ) : (
      rows.map((entry) => (
        <ApprovalRow
          key={entry.id}
          entry={entry}
          open={open === entry.id}
          pending={pending}
          onToggle={() => setOpen((o) => (o === entry.id ? null : entry.id))}
          onDecide={(decision) => act(entry, decision)}
        />
      ))
    );

  return (
    <>
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      <div className="admin-approvals-tabs">
        <Tabs
          tabs={[
            { key: "all", label: "All", count: waiting.length, content: <section className="admin-card admin-approvals-list" aria-label="Waiting">{list(waiting)}</section> },
            { key: "me", label: "Named on me", count: mine.length, content: <section className="admin-card admin-approvals-list" aria-label="Waiting">{list(mine)}</section> },
            { key: "roles", label: "My roles", count: roles.length, content: <section className="admin-card admin-approvals-list" aria-label="Waiting">{list(roles)}</section> },
          ]}
        />
      </div>
      {decided.length > 0 && (
        <section className="admin-approvals-decided" aria-label="Decided just now">
          <h2 className="admin-approvals-decided-title">Decided just now</h2>
          {decided.map((d) => (
            <div key={d.id} className="admin-card admin-approvals-decided-row">
              <span>{d.title}</span>
              <Badge tone={d.decision === "approved" ? "ok" : "err"}>{d.decision === "approved" ? "Approved" : "Declined"}</Badge>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

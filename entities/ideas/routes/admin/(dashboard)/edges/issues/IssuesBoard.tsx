"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { PersonSelect } from "@/entities/crm/client";
import type { PersonOption } from "@/entities/crm/client";
import { DAVE_PERSON_ID, ISSUE_DIAGNOSES, type IssueRow } from "@/entities/org/client";
import { createIssue, setIssueAssignee, setIssueStatus } from "./actions";

const DIAG_BADGE: Record<string, string> = {
  goal: "admin-badge--info",
  system: "admin-badge--warn",
  execution: "admin-badge--pink",
};

function age(created: string): string {
  const days = Math.floor((Date.now() - new Date(created).getTime()) / 86400000);
  if (days < 1) return "today";
  return `${days}d`;
}

export function IssuesBoard({
  issues,
  krs,
  personNames,
  teamOptions,
}: {
  issues: IssueRow[];
  krs: { id: string; title: string }[];
  personNames: Record<string, string>;
  teamOptions: PersonOption[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const krTitle = new Map(krs.map((k) => [k.id, k.title]));
  const personOptions = teamOptions.map((p) => ({ value: p.id, label: p.name }));

  const open = issues.filter((i) => i.status === "open" || i.status === "solving");
  const closed = issues.filter((i) => i.status === "solved" || i.status === "dropped");

  async function move(id: string, status: string) {
    setBusyId(id);
    const res = await setIssueStatus(id, status);
    setBusyId(null);
    if (!res.ok) setErr(res.error);
    else {
      setErr(null);
      startTransition(() => router.refresh());
    }
  }

  async function assign(id: string, personId: string) {
    if (!personId) return;
    setBusyId(id);
    const res = await setIssueAssignee(id, personId);
    setBusyId(null);
    if (!res.ok) setErr(res.error);
    else {
      setErr(null);
      startTransition(() => router.refresh());
    }
  }

  function table(rows: IssueRow[], label: string) {
    return (
      <div className="admin-table-wrap u-mb-4">
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{label}</th>
                <th>Diagnosis</th>
                <th>Blocks</th>
                <th>Assigned to</th>
                <th>Filed by</th>
                <th>Age</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="admin-empty">Nothing here.</div>
                  </td>
                </tr>
              )}
              {rows.map((i) => (
                <tr key={i.id}>
                  <td className="admin-cell-strong">
                    {i.title}
                    {i.notes_md && <div className="admin-cell-muted">{i.notes_md}</div>}
                  </td>
                  <td>
                    <span className={`admin-badge ${DIAG_BADGE[i.diagnosis]}`}>{i.diagnosis.toUpperCase()}</span>
                  </td>
                  <td className="admin-cell-muted" title={i.key_result_id ? krTitle.get(i.key_result_id) : undefined}>
                    {i.key_result_id ? `${(krTitle.get(i.key_result_id) ?? "").slice(0, 30)}…` : "—"}
                  </td>
                  <td>
                    {i.status === "open" || i.status === "solving" ? (
                      <PersonSelect
                        compact
                        ariaLabel={`Assignee for ${i.title}`}
                        className="u-min-2"
                        value={i.assignee_person_id ?? ""}
                        disabled={busyId === i.id}
                        onChange={(personId) => assign(i.id, personId)}
                        emptyLabel="Unassigned"
                        options={
                          // Someone assigned before they left is off the roster
                          // but still has to show as the current holder.
                          i.assignee_person_id && !teamOptions.some((p) => p.id === i.assignee_person_id)
                            ? [
                                ...personOptions,
                                {
                                  value: i.assignee_person_id,
                                  label: personNames[i.assignee_person_id] ?? "Former team member",
                                },
                              ]
                            : personOptions
                        }
                      />
                    ) : (
                      <span className="admin-cell-muted">
                        {i.assignee_person_id ? (personNames[i.assignee_person_id] ?? "—") : "—"}
                      </span>
                    )}
                  </td>
                  <td className="admin-cell-muted">
                    {i.filed_by}
                    {i.filed_by.endsWith(":auto") && (
                      <span className="admin-badge admin-badge--ok u-ml-2">
                        AGENT
                      </span>
                    )}
                  </td>
                  <td className="admin-cell-mono">{age(i.created_at)}</td>
                  <td>
                    {(i.status === "open" || i.status === "solving") ? (
                      <span className="u-row">
                        {i.status === "open" && (
                          <button className="admin-edges-minibtn" disabled={busyId === i.id} onClick={() => move(i.id, "solving")}>
                            Start solving
                          </button>
                        )}
                        <button className="admin-edges-minibtn" disabled={busyId === i.id} onClick={() => move(i.id, "solved")}>
                          Solved
                        </button>
                        <button className="admin-edges-minibtn" disabled={busyId === i.id} onClick={() => move(i.id, "dropped")}>
                          Drop
                        </button>
                      </span>
                    ) : (
                      <span className="admin-cell-muted">{i.status}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <>
      {err && (
        <div className="admin-alert admin-alert--err u-mb-4">
          {err}
        </div>
      )}
      <div className="admin-toolbar u-end">
        <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => setDrawerOpen(true)}>
          + File issue
        </button>
      </div>
      {table(open, "Open issues")}
      {closed.length > 0 && table(closed, "Solved and dropped")}

      <DetailDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} eyebrow="8 Edges" title="File an issue">
        <IssueForm
          krs={krs}
          teamOptions={teamOptions}
          onDone={(res) => {
            if (res.ok) {
              setDrawerOpen(false);
              startTransition(() => router.refresh());
            }
          }}
        />
      </DetailDrawer>
    </>
  );
}

function IssueForm({
  krs,
  teamOptions,
  onDone,
}: {
  krs: { id: string; title: string }[];
  teamOptions: PersonOption[];
  onDone: (res: { ok: boolean; error?: string }) => void;
}) {
  const [title, setTitle] = useState("");
  const [diagnosis, setDiagnosis] = useState<string>("system");
  const [assignee, setAssignee] = useState<string>(
    teamOptions.some((p) => p.id === DAVE_PERSON_ID) ? DAVE_PERSON_ID : (teamOptions[0]?.id ?? ""),
  );
  const [krId, setKrId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="admin-form">
      {err && <div className="admin-alert admin-alert--err">{err}</div>}
      <div className="admin-field">
        <label className="admin-label">What&apos;s blocking?</label>
        <input className="admin-input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="u-grid-2 u-gap-3">
        <div className="admin-field">
          <label className="admin-label">Diagnosis</label>
          <select className="admin-select" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)}>
            {ISSUE_DIAGNOSES.map((d) => (
              <option key={d} value={d}>
                {d === "goal" ? "goal problem (target is wrong)" : d === "system" ? "system problem (process gap)" : "execution problem (work slipped)"}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-field">
          <label className="admin-label">Blocks which key result?</label>
          <select className="admin-select" value={krId} onChange={(e) => setKrId(e.target.value)}>
            <option value="">none / general</option>
            {krs.map((k) => (
              <option key={k.id} value={k.id}>
                {k.title.slice(0, 60)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="admin-field">
        <label className="admin-label">Assigned to</label>
        <PersonSelect
          value={assignee}
          onChange={setAssignee}
          options={teamOptions.map((p) => ({ value: p.id, label: p.name }))}
        />
      </div>
      <div className="admin-field">
        <label className="admin-label">Notes (context, proposed fix)</label>
        <textarea className="admin-textarea" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="admin-form-actions">
        <button
          className="admin-btn admin-btn--primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const res = await createIssue({
              title,
              diagnosis,
              assignee_person_id: assignee,
              key_result_id: krId || undefined,
              notes_md: notes,
            });
            setBusy(false);
            if (!res.ok) setErr(res.error ?? "Something went wrong.");
            else onDone(res);
          }}
        >
          {busy ? "Filing…" : "File issue"}
        </button>
      </div>
    </div>
  );
}

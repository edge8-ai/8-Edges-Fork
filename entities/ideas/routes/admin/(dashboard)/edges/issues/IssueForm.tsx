"use client";
// The form that files an issue (Issues, ED-1; split out of IssuesBoard in AH.8
// so each file stays readable). It opens in the page's drawer.
import { useState } from "react";
import { PersonSelect } from "@/entities/crm/client";
import type { PersonOption } from "@/entities/crm/client";
import { DAVE_PERSON_ID, ISSUE_DIAGNOSES } from "@/entities/org/client";
import type { MayProp } from "@/kernel/identity/may-prop";
import { createIssue } from "./actions";

export function IssueForm({
  krs,
  teamOptions,
  onDone,
  may,
}: {
  krs: { id: string; title: string }[];
  teamOptions: PersonOption[];
  onDone: (res: { ok: boolean; error?: string }) => void;
  may: MayProp;
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
  // Hidden from a reader who may not file one (ADR 0014); createIssue refuses anyway.
  if (!may["ideas.manage"]) return null;
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

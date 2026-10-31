"use client";

// The two forms that add to the interview journey: a seat on an existing
// round's panel, and a new round. Split out of InterviewRounds.tsx.

import { useReducer, useState } from "react";
import { ROUND_MODES } from "@/entities/hiring/lib/interview-panel";
import {
  addPanelist,
  createInterviewRound,
  type InterviewRound,
  type TeamOption,
} from "./interview-actions";

export function AddSeatControl({
  round,
  teamById,
  onChange,
}: {
  round: InterviewRound;
  teamById: Map<string, string>;
  onChange: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [personId, setPersonId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const seated = new Set(round.seats.map((s) => s.interviewerId));
  const options = [...teamById.entries()].filter(([id]) => !seated.has(id));

  async function add() {
    if (!personId) return;
    setBusy(true);
    setErr(null);
    const r = await addPanelist(round.id, personId, "interviewer");
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setPersonId("");
    setOpen(false);
    await onChange();
  }

  if (!open) {
    return (
      <div className="u-mt-2">
        <button type="button" className="admin-btn admin-btn--sm" onClick={() => setOpen(true)}>
          + Add panelist
        </button>
      </div>
    );
  }

  return (
    <div className="u-row u-wrap u-mt-2">
      <select
        className="admin-select u-max-3"
        value={personId}
        onChange={(e) => setPersonId(e.target.value)}
      >
        <option value="">Choose a team member…</option>
        {options.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
      <button type="button" className="admin-btn admin-btn--primary admin-btn--sm" disabled={busy || !personId} onClick={add}>
        {busy ? "Adding…" : "Add"}
      </button>
      <button type="button" className="admin-btn admin-btn--sm" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {err && <span className="u-sm u-err">{err}</span>}
    </div>
  );
}

// The new-round draft. A merge reducer rather than a field per useState: the
// fields only ever move as one object, and `create` reads them as one.
type RoundDraft = { title: string; mode: string; when: string; panelists: string[] };
const EMPTY_ROUND_DRAFT: RoundDraft = { title: "", mode: "video", when: "", panelists: [] };
const mergeRoundDraft = (state: RoundDraft, p: Partial<RoundDraft>): RoundDraft => ({ ...state, ...p });

export function AddRoundForm({
  applicationId,
  team,
  onDone,
  onCancel,
}: {
  applicationId: string;
  team: TeamOption[];
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  // One draft, not four variables: these fields are born, submitted and thrown
  // away together, and `create` wants them as a single object. `busy` and `err`
  // stay separate because submission status outlives no draft field.
  const [draft, patch] = useReducer(mergeRoundDraft, EMPTY_ROUND_DRAFT);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function togglePanelist(id: string) {
    patch({
      panelists: draft.panelists.includes(id)
        ? draft.panelists.filter((x) => x !== id)
        : [...draft.panelists, id],
    });
  }

  async function create() {
    setBusy(true);
    setErr(null);
    const scheduledAt = draft.when ? new Date(draft.when).toISOString() : null;
    const r = await createInterviewRound(applicationId, {
      title: draft.title,
      mode: draft.mode,
      scheduledAt,
      panelistIds: draft.panelists,
    });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    await onDone();
  }

  return (
    <div className="admin-form u-mt-3 u-p-4 admin-box">
      <div className="admin-field">
        <label className="admin-label">Round title</label>
        <input
          className="admin-input"
          placeholder="Recruiter screen, Engineering interview, Founder interview…"
          value={draft.title}
          onChange={(e) => patch({ title: e.target.value })}
        />
      </div>
      <div className="u-grid-2 u-gap-3">
        <div className="admin-field">
          <label className="admin-label">Mode</label>
          <select className="admin-select" value={draft.mode} onChange={(e) => patch({ mode: e.target.value })}>
            {ROUND_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-field">
          <label className="admin-label">When (optional)</label>
          <input className="admin-input" type="datetime-local" value={draft.when} onChange={(e) => patch({ when: e.target.value })} />
        </div>
      </div>

      <div className="admin-field">
        <label className="admin-label">Human panelists</label>
        {team.length === 0 ? (
          <div className="admin-hint">Loading team…</div>
        ) : (
          <div className="u-row u-wrap u-gap-2 admin-scroll-xs">
            {team.map((t) => {
              const on = draft.panelists.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  className="admin-btn admin-btn--sm"
                  aria-pressed={on}
                  onClick={() => togglePanelist(t.id)}
                  style={on ? { borderColor: "var(--admin-accent)", color: "var(--admin-accent)", fontWeight: 600 } : undefined}
                >
                  {on ? "✓ " : ""}
                  {t.name}
                </button>
              );
            })}
          </div>
        )}
        <div className="admin-hint u-mt-1">
          The AI panelist is seated automatically.
        </div>
      </div>

      {err && <div className="admin-alert admin-alert--err">{err}</div>}

      <div className="admin-form-actions">
        <button
          type="button"
          className="admin-btn admin-btn--primary admin-btn--sm"
          disabled={busy || !draft.title.trim() || draft.panelists.length === 0}
          onClick={create}
        >
          {busy ? "Creating…" : "Create round"}
        </button>
        <button type="button" className="admin-btn admin-btn--sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

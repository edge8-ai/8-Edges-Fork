"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { formatDate, formatHours } from "@/kernel/ui/format";
import type { CapacityCommitment, CapacityRole, PickerOption } from "@/entities/org/lib/capacity";
import {
  archiveCapacityCommitment,
  createCapacityCommitment,
  updateCapacityCommitment,
} from "@/entities/org/lib/capacity-actions";
import { CAPACITY_SOURCES, type CapacitySource } from "@/entities/org/lib/capacity-schemas";
import { RowButton } from "./RowButton";
import { SOURCE_LABELS } from "./labels";

// Hours of a role already promised, to a client or to internal work. What is
// listed is what can still affect capacity: commitments that ended before this
// week are left off. A commitment names a role and a company, never a person.

type Editing = { mode: "new" } | { mode: "edit"; commitment: CapacityCommitment } | null;
type Props = { commitments: CapacityCommitment[]; roles: CapacityRole[]; companies: PickerOption[]; today: string };

export function CommitmentsPanel({ commitments, roles, companies, today }: Props) {
  const [editing, setEditing] = useState<Editing>(null);
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const close = () => setEditing(null);

  return (
    <section className="admin-card admin-section-card u-mt-5">
      <div className="admin-card-head">
        <h2 className="admin-card-title">Commitments</h2>
        <button
          type="button"
          className="admin-btn admin-btn--primary admin-btn--sm"
          disabled={roles.length === 0}
          title={roles.length === 0 ? "Add a role first" : undefined}
          onClick={() => setEditing({ mode: "new" })}
        >
          New commitment
        </button>
      </div>
      {commitments.length === 0 ? (
        <div className="admin-empty">Nothing committed from this week on.</div>
      ) : (
        <div className="admin-table-wrap admin-table-wrap--flat">
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>For</th>
                  <th>Hours per week</th>
                  <th>Starts</th>
                  <th>Ends</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {commitments.map((c) => (
                  <RowButton key={c.id} onOpen={() => setEditing({ mode: "edit", commitment: c })}>
                    <td className="admin-cell-strong">{roleName.get(c.roleId) ?? "—"}</td>
                    <td>{c.companyId ? c.companyName ?? "—" : "Internal"}</td>
                    <td className="admin-cell-mono">{formatHours(c.hoursPerWeek)}</td>
                    <td className="admin-cell-muted">{formatDate(c.startsOn)}</td>
                    <td className="admin-cell-muted">{c.endsOn ? formatDate(c.endsOn) : "Open-ended"}</td>
                    <td className="admin-cell-muted">{SOURCE_LABELS[c.source]}</td>
                  </RowButton>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <DetailDrawer open={editing !== null} onClose={close} eyebrow="Commitment" title={editing?.mode === "edit" ? "Edit commitment" : "New commitment"}>
        {editing && (
          <CommitmentForm
            key={editing.mode === "edit" ? editing.commitment.id : "new"}
            commitment={editing.mode === "edit" ? editing.commitment : null}
            roles={roles}
            companies={companies}
            today={today}
            onDone={close}
          />
        )}
      </DetailDrawer>
    </section>
  );
}

type FormProps = {
  commitment: CapacityCommitment | null;
  roles: CapacityRole[];
  companies: PickerOption[];
  today: string;
  onDone: () => void;
};

function CommitmentForm({ commitment, roles, companies, today, onDone }: FormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [roleId, setRoleId] = useState(commitment?.roleId ?? roles[0]?.id ?? "");
  const [companyId, setCompanyId] = useState(commitment?.companyId ?? "");
  const [hours, setHours] = useState(commitment ? String(commitment.hoursPerWeek) : "");
  const [startsOn, setStartsOn] = useState(commitment?.startsOn ?? today);
  const [endsOn, setEndsOn] = useState(commitment?.endsOn ?? "");
  const [source, setSource] = useState<CapacitySource>(commitment?.source ?? "manual");
  const [note, setNote] = useState(commitment?.note ?? "");

  // A commitment's company may since have been archived and so be missing from
  // the picker; it is kept as an option so editing the hours does not silently
  // move the work to "Internal".
  const options =
    commitment?.companyId && !companies.some((c) => c.id === commitment.companyId)
      ? [{ id: commitment.companyId, label: commitment.companyName ?? "Archived company" }, ...companies]
      : companies;

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = {
      roleId,
      companyId,
      hoursPerWeek: hours.trim() === "" ? Number.NaN : Number(hours),
      startsOn,
      endsOn,
      source,
      note,
    };
    startTransition(async () => {
      const res = commitment ? await updateCapacityCommitment(commitment.id, input) : await createCapacityCommitment(input);
      if (!res.ok) return setError(res.error);
      onDone();
      router.refresh();
    });
  }

  return (
    <div className="admin-shelf-sections">
      <section>
        <form className="admin-form" onSubmit={save}>
          {error && <div className="admin-alert admin-alert--err">{error}</div>}
          <div className="admin-field">
            <label className="admin-label" htmlFor="cm-role">Role</label>
            <select id="cm-role" className="admin-select" value={roleId} onChange={(e) => setRoleId(e.target.value)} autoFocus>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="cm-company">For</label>
            <select id="cm-company" className="admin-select" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">Internal work</option>
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="cm-hours">Hours per week</label>
            <input
              id="cm-hours"
              className="admin-input"
              type="number"
              min="0"
              step="0.5"
              inputMode="decimal"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </div>
          <div className="admin-form-row">
            <div className="admin-field">
              <label className="admin-label" htmlFor="cm-start">Starts</label>
              <input id="cm-start" className="admin-input" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
            </div>
            <div className="admin-field">
              <label className="admin-label" htmlFor="cm-end">Ends (blank if open-ended)</label>
              <input id="cm-end" className="admin-input" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </div>
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="cm-source">Came from</label>
            <select id="cm-source" className="admin-select" value={source} onChange={(e) => setSource(e.target.value as CapacitySource)}>
              {CAPACITY_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="cm-note">Note</label>
            <textarea id="cm-note" className="admin-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="admin-form-actions">
            <button type="submit" className="admin-btn admin-btn--primary" disabled={pending}>
              {pending ? "Saving…" : commitment ? "Save commitment" : "Add commitment"}
            </button>
          </div>
        </form>
      </section>

      {commitment && (
        <section>
          <div className="admin-shelf-heading">Archive</div>
          <ConfirmButton
            label="Archive commitment"
            title="Archive commitment"
            body="Archive this commitment? Its hours are freed in the forecast straight away."
            confirmLabel="Archive"
            onConfirm={() => archiveCapacityCommitment(commitment.id)}
            onDone={() => {
              onDone();
              router.refresh();
            }}
          />
        </section>
      )}
    </div>
  );
}

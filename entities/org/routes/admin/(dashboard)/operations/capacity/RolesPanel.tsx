"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { formatDate, formatHours } from "@/kernel/ui/format";
import type { CapacityRole, PickerOption } from "@/entities/org/lib/capacity";
import { archiveCapacityRole, createCapacityRole, updateCapacityRole } from "@/entities/org/lib/capacity-actions";
import { RowButton } from "./RowButton";

// The roles the company sells hours of, each with its weekly supply. A row
// opens the drawer to edit it; "New role" opens the same form empty. Roles and
// hours only: there is deliberately no field for who fills a role.

type Editing = { mode: "new" } | { mode: "edit"; role: CapacityRole } | null;

export function RolesPanel({ roles, positions, today }: { roles: CapacityRole[]; positions: PickerOption[]; today: string }) {
  const [editing, setEditing] = useState<Editing>(null);
  const positionLabel = new Map(positions.map((p) => [p.id, p.label]));
  const close = () => setEditing(null);

  return (
    <section className="admin-card admin-section-card u-mt-5">
      <div className="admin-card-head">
        <h2 className="admin-card-title">Roles</h2>
        <button type="button" className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => setEditing({ mode: "new" })}>
          New role
        </button>
      </div>
      {roles.length === 0 ? (
        <div className="admin-empty">No roles yet.</div>
      ) : (
        <div className="admin-table-wrap admin-table-wrap--flat">
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Position</th>
                  <th>Hours per week</th>
                  <th>Counts from</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => (
                  <RowButton key={r.id} onOpen={() => setEditing({ mode: "edit", role: r })}>
                    <td className="admin-cell-strong">{r.name}</td>
                    <td className="admin-cell-muted">{(r.positionId && positionLabel.get(r.positionId)) || "—"}</td>
                    <td className="admin-cell-mono">{formatHours(r.hoursPerWeek)}</td>
                    <td className="admin-cell-muted">{formatDate(r.effectiveFrom)}</td>
                  </RowButton>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <DetailDrawer
        open={editing !== null}
        onClose={close}
        eyebrow="Capacity role"
        title={editing?.mode === "edit" ? editing.role.name : "New role"}
      >
        {editing && (
          <RoleForm
            key={editing.mode === "edit" ? editing.role.id : "new"}
            role={editing.mode === "edit" ? editing.role : null}
            positions={positions}
            today={today}
            onDone={close}
          />
        )}
      </DetailDrawer>
    </section>
  );
}

function RoleForm({
  role,
  positions,
  today,
  onDone,
}: {
  role: CapacityRole | null;
  positions: PickerOption[];
  today: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(role?.name ?? "");
  const [positionId, setPositionId] = useState(role?.positionId ?? "");
  const [hours, setHours] = useState(role ? String(role.hoursPerWeek) : "");
  const [effectiveFrom, setEffectiveFrom] = useState(role?.effectiveFrom ?? today);

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // An empty box is NaN rather than 0, so the schema refuses it instead of
    // quietly saving a role that supplies nothing.
    const input = { name, positionId, hoursPerWeek: hours.trim() === "" ? Number.NaN : Number(hours), effectiveFrom };
    startTransition(async () => {
      const res = role ? await updateCapacityRole(role.id, input) : await createCapacityRole(input);
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
            <label className="admin-label" htmlFor="role-name">Name</label>
            <input id="role-name" className="admin-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="role-position">Position (optional)</label>
            <select id="role-position" className="admin-select" value={positionId} onChange={(e) => setPositionId(e.target.value)}>
              <option value="">No position</option>
              {positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="role-hours">Hours per week it can give</label>
            <input
              id="role-hours"
              className="admin-input"
              type="number"
              min="0"
              step="0.5"
              inputMode="decimal"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="role-from">Counts from</label>
            <input id="role-from" className="admin-input" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </div>
          <div className="admin-form-actions">
            <button type="submit" className="admin-btn admin-btn--primary" disabled={pending}>
              {pending ? "Saving…" : role ? "Save role" : "Add role"}
            </button>
          </div>
        </form>
      </section>

      {role && (
        <section>
          <div className="admin-shelf-heading">Archive</div>
          <ConfirmButton
            label="Archive role"
            title="Archive role"
            body={`Archive ${role.name}? It leaves the forecast and the pickers, and so do its commitments.`}
            confirmLabel="Archive"
            onConfirm={() => archiveCapacityRole(role.id)}
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

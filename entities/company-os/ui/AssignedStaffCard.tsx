"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createAssignment,
  endAssignment,
  setAssignmentVisibility,
  setAssignmentClientManager,
} from "@/entities/company-os/lib/staff-assignments-actions";
import {
  ASSIGNMENT_ROLES,
  type AssignmentForCompany,
  type ClientContactOption,
  type TeamMemberOption,
} from "@/entities/contacts/client";
import { Badge } from "@/kernel/ui/Badge";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { personName } from "@/kernel/config/people-name";

// "Assigned staff" card on the company 360 — who from Edge8 is dedicated to
// this client, with add/end controls.
export function AssignedStaffCard({
  companyId,
  assignments,
  teamMembers,
  clientContacts,
}: {
  companyId: string;
  assignments: AssignmentForCompany[];
  teamMembers: TeamMemberOption[];
  clientContacts: ClientContactOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [teamMemberId, setTeamMemberId] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [clientVisible, setClientVisible] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!teamMemberId) return;
    setMsg(null);
    start(async () => {
      const res = await createAssignment({ companyId, teamMemberId, roleTitle, clientVisible });
      if (res.ok) {
        setTeamMemberId("");
        setRoleTitle("");
        setClientVisible(true);
        router.refresh();
      } else {
        setMsg(res.error);
      }
    });
  }

  function toggleVisible(id: string, next: boolean) {
    setMsg(null);
    start(async () => {
      const res = await setAssignmentVisibility(id, next);
      if (res.ok) router.refresh();
      else setMsg(res.error);
    });
  }

  function setClientManager(id: string, personId: string) {
    setMsg(null);
    start(async () => {
      const res = await setAssignmentClientManager(id, personId || null);
      if (res.ok) router.refresh();
      else setMsg(res.error);
    });
  }

  return (
    <div className="admin-card admin-section-card">
      <h2 className="admin-card-title">Assigned staff ({assignments.length})</h2>
      {assignments.length === 0 ? (
        <div className="admin-empty">No dedicated staff assigned yet.</div>
      ) : (
        <div className="admin-list u-mb-3">
          {assignments.map((a) => (
            <div className="admin-list-row admin-staff-assign-row" key={a.id}>
              <div className="admin-list-main">
                <div className="admin-list-title">{personName(a, "Unknown")}</div>
                <div className="admin-list-sub admin-staff-assign-sub">
                  {a.role_title || a.position_title || "No role set"}
                  {a.client_visible ? (
                    <Badge tone="ok">On client team</Badge>
                  ) : (
                    <Badge tone="neutral">Internal only</Badge>
                  )}
                </div>
              </div>
              <div className="admin-list-aside admin-staff-assign-actions">
                <label className="admin-cell-muted u-sm">
                  Approves leave
                  <select
                    className="admin-select admin-select--sm u-ml-2"
                    value={a.client_manager_person_id ?? ""}
                    disabled={pending}
                    onChange={(e) => setClientManager(a.id, e.target.value)}
                    title="Person at this client who approves this person's time off. Blank leaves it with their Edge8 manager."
                  >
                    <option value="">Edge8 manager</option>
                    {clientContacts.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
                <button
                  className="admin-btn admin-btn--sm"
                  disabled={pending}
                  onClick={() => toggleVisible(a.id, !a.client_visible)}
                  title={a.client_visible ? "Hide from the client's team roster" : "Show on the client's team roster"}
                >
                  {a.client_visible ? "Make internal" : "Show to client"}
                </button>
                <ConfirmButton
                  label="End"
                  className="admin-btn admin-btn--sm admin-btn--danger"
                  title="End this assignment?"
                  body="It will no longer show for the client."
                  confirmLabel="End assignment"
                  disabled={pending}
                  onConfirm={() => endAssignment(a.id)}
                  onDone={() => router.refresh()}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <form className="admin-form" onSubmit={handleAdd}>
        {msg && <div className="admin-alert admin-alert--err">{msg}</div>}
        <div className="admin-field">
          <label className="admin-label" htmlFor="assign-team-member">Add staff</label>
          <select
            id="assign-team-member"
            className="admin-input"
            value={teamMemberId}
            onChange={(e) => setTeamMemberId(e.target.value)}
          >
            <option value="">Pick a team member…</option>
            {teamMembers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="assign-role-title">Role (client-visible label, optional)</label>
          <select
            id="assign-role-title"
            className="admin-input"
            value={roleTitle}
            onChange={(e) => setRoleTitle(e.target.value)}
          >
            <option value="">No role</option>
            {ASSIGNMENT_ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <div className="admin-field">
          <label className="admin-label admin-label--check">
            <input type="checkbox" checked={clientVisible} onChange={(e) => setClientVisible(e.target.checked)} />
            Show on the client&apos;s team roster
          </label>
          <div className="admin-cell-muted u-sm u-mt-1">
            Uncheck for internal-only staff who should see the account but not appear to the client.
          </div>
        </div>
        <div className="admin-form-actions">
          <button type="submit" className="admin-btn admin-btn--primary" disabled={pending || !teamMemberId}>
            {pending ? "Assigning…" : "Assign"}
          </button>
        </div>
      </form>
    </div>
  );
}

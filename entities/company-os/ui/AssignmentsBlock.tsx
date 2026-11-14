"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAssignment, endAssignment, setAssignmentVisibility } from "@/entities/company-os/lib/staff-assignments-actions";
import { ASSIGNMENT_ROLES, type AssignmentForTeamMember, type CompanyOption } from "@/entities/contacts/client";
import { Badge } from "@/kernel/ui/Badge";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";

// "Assignments" block on the team-member detail page — which clients this
// person is dedicated to, with add/end controls.
export function AssignmentsBlock({
  teamMemberId,
  assignments,
  companies,
}: {
  teamMemberId: string;
  assignments: AssignmentForTeamMember[];
  companies: CompanyOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [companyId, setCompanyId] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [clientVisible, setClientVisible] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId) return;
    setMsg(null);
    start(async () => {
      const res = await createAssignment({ companyId, teamMemberId, roleTitle, clientVisible });
      if (res.ok) {
        setCompanyId("");
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

  return (
    <div className="admin-card admin-section-card">
      <h2 className="admin-card-title">Client assignments ({assignments.length})</h2>
      {assignments.length === 0 ? (
        <div className="admin-empty">Not assigned to any client yet.</div>
      ) : (
        <div className="admin-list u-mb-3">
          {assignments.map((a) => (
            <div className="admin-list-row" key={a.id}>
              <div className="admin-list-main">
                <div className="admin-list-title">{a.company_name || "—"}</div>
                <div className="admin-list-sub u-row">
                  {a.role_title || "No role set"}
                  {a.client_visible ? (
                    <Badge tone="ok">On client team</Badge>
                  ) : (
                    <Badge tone="neutral">Internal only</Badge>
                  )}
                </div>
                <div className="admin-list-sub">
                  Leave approved by{" "}
                  {a.client_manager_name ? `${a.client_manager_name} (client)` : "their Edge8 manager"}
                </div>
              </div>
              <div className="admin-list-aside admin-list-aside--row">
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
                  body="The assignment is closed as of today; its history stays on record."
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
          <label className="admin-label" htmlFor="assign-company">Assign to client</label>
          <select
            id="assign-company"
            className="admin-input"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
          >
            <option value="">Pick a client…</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="assign-role-title-2">Role (client-visible label, optional)</label>
          <select
            id="assign-role-title-2"
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
        </div>
        <div className="admin-form-actions">
          <button type="submit" className="admin-btn admin-btn--primary" disabled={pending || !companyId}>
            {pending ? "Assigning…" : "Assign"}
          </button>
        </div>
      </form>
    </div>
  );
}

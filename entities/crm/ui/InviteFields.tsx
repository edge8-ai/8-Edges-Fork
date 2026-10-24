"use client";

import { EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_LABEL } from "@/kernel/identity/employment-types";

export type InviteRoleOption = { id: string; name: string; description: string };

// The two fields the team invite gains (ADR 0013, AC.18): Type, which sets the
// person's employment type and with it the baseline role (a Contractor is a team
// member whose type is Contractor), and Roles, the modules they start with.
// Roles are only offered to someone who manages access, and only the ones that
// person may grant; for anyone else the form says why there are none.
export function InviteFields({
  type,
  onType,
  roles,
  canGrantRoles,
  roleIds,
  onRoles,
}: {
  type: string;
  onType: (next: string) => void;
  roles: InviteRoleOption[];
  canGrantRoles: boolean;
  roleIds: string[];
  onRoles: (next: string[]) => void;
}) {
  const toggle = (id: string) => onRoles(roleIds.includes(id) ? roleIds.filter((r) => r !== id) : [...roleIds, id]);

  return (
    <div className="admin-form u-mt-3">
      <label className="admin-field">
        <span className="admin-label">Type</span>
        <select className="admin-select" value={type} onChange={(e) => onType(e.target.value)}>
          {type === "" && <option value="">Not set</option>}
          {EMPLOYMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {EMPLOYMENT_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <span className="admin-hint">Sets what they can open to begin with. A Contractor starts with the narrower contractor baseline.</span>
      </label>

      {!canGrantRoles ? (
        <span className="admin-hint">Roles are granted by people who manage access. Invite now and grant them later in Settings, Access.</span>
      ) : (
        <div className="admin-field" role="group" aria-labelledby="invite-roles-label">
          <span id="invite-roles-label" className="admin-label">Roles</span>
          {roles.length === 0 && <span className="admin-hint">There are no roles you may grant. Create one in Settings, Access.</span>}
          {roles.map((r) => (
            <label key={r.id} className="u-row u-pointer" title={r.description}>
              <input type="checkbox" checked={roleIds.includes(r.id)} onChange={() => toggle(r.id)} />
              {r.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

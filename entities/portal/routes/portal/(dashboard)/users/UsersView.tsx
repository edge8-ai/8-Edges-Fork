"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CompanyUser } from "@/entities/portal/lib/users";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import {
  inviteUserAction,
  resendUserInviteAction,
  revokeUserAction,
  setUserRoleAction,
} from "./actions";

// Users page for portal admins: list, invite (name + email + role), change
// role, resend link, revoke. The server re-checks every rule; this UI just
// keeps the honest path obvious.

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  contributor: "Contributor",
  viewer: "Viewer",
};

const ROLE_HELP: Record<string, string> = {
  admin: "Everything, including invoices and user management.",
  contributor: "Can propose roadmap items, upload documents, and create requests. No invoices.",
  viewer: "Read-only access.",
};

export function UsersView({
  companyId,
  companyName,
  users,
}: {
  companyId: string;
  companyName: string;
  users: CompanyUser[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("contributor");

  function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, after?: () => void) {
    setMsg(null);
    setErr(null);
    start(async () => {
      const r = await fn();
      if (r.ok) {
        setMsg(r.message ?? "Done.");
        after?.();
        router.refresh();
      } else {
        setErr(r.error ?? "Something went wrong.");
      }
    });
  }

  const active = users.filter((u) => u.membershipStatus === "active");
  const revoked = users.filter((u) => u.membershipStatus !== "active");

  return (
    <div className="admin-card admin-section-card u-mb-4">
      <div className="u-row u-gap-3 u-wrap u-mb-3">
        <h2 className="admin-card-title u-m-0 u-grow">{companyName}</h2>
        <button type="button" className="admin-btn admin-btn--sm admin-btn--primary" onClick={() => setShowInvite((v) => !v)}>
          {showInvite ? "Cancel" : "Invite a user"}
        </button>
      </div>

      {showInvite && (
        <div className="u-mb-4 u-p-4 u-max-6 admin-box">
          <label className="admin-label" htmlFor="inv-name">Name</label>
          <input id="inv-name" className="admin-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex Chen" disabled={pending} />
          <div className="u-mt-3">
            <label className="admin-label" htmlFor="inv-email">Email</label>
            <input id="inv-email" className="admin-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@yourcompany.com" disabled={pending} />
          </div>
          <div className="u-mt-3">
            <label className="admin-label" htmlFor="inv-role">Role</label>
            <select id="inv-role" className="admin-select" value={role} onChange={(e) => setRole(e.target.value)} disabled={pending}>
              <option value="admin">Admin</option>
              <option value="contributor">Contributor</option>
              <option value="viewer">Viewer</option>
            </select>
            <div className="admin-cell-muted u-mt-2 u-sm">{ROLE_HELP[role]}</div>
          </div>
          <div className="u-mt-3">
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              disabled={pending || !name.trim() || !email.trim()}
              onClick={() =>
                run(
                  () => inviteUserAction({ companyId, name, email, role }),
                  () => {
                    setShowInvite(false);
                    setName("");
                    setEmail("");
                    setRole("contributor");
                  },
                )
              }
            >
              {pending ? "Sending…" : "Send invite"}
            </button>
          </div>
        </div>
      )}

      <div className="admin-list">
        {active.map((u) => (
          <div className="admin-list-row" key={u.personId}>
            <div className="admin-list-main">
              <div className="admin-list-title">
                {u.name}
                {u.isSelf && <span className="admin-cell-muted"> (you)</span>}
              </div>
              <div className="admin-list-sub">
                {u.email}
                {u.accessStatus === "invited" && " · invited, not signed in yet"}
                {u.accessStatus === "none" && " · not invited yet"}
              </div>
            </div>
            <div className="admin-list-aside u-wrap">
              {u.isSelf ? (
                <span className="admin-badge">{ROLE_LABEL[u.role] ?? u.role}</span>
              ) : (
                <>
                  <select
                    className="admin-select u-p-1 u-sm"
                    value={u.role}
                    disabled={pending}
                    aria-label={`Role for ${u.name}`}
                    onChange={(e) => run(() => setUserRoleAction({ companyId, personId: u.personId, role: e.target.value }))}
                  >
                    <option value="admin">Admin</option>
                    <option value="contributor">Contributor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  {u.accessStatus === "invited" && (
                    <button
                      type="button"
                      className="admin-btn admin-btn--sm"
                      disabled={pending}
                      onClick={() => run(() => resendUserInviteAction({ companyId, personId: u.personId }))}
                    >
                      Resend link
                    </button>
                  )}
                  <ConfirmButton
                    label="Remove"
                    className="admin-btn admin-btn--sm admin-btn--danger"
                    title={`Remove ${u.name}'s portal access?`}
                    body="They can no longer sign in to the portal. You can invite them again later."
                    confirmLabel="Remove access"
                    disabled={pending}
                    onConfirm={async () => {
                      setMsg(null);
                      setErr(null);
                      const r = await revokeUserAction({ companyId, personId: u.personId });
                      if (r.ok) setMsg(r.message);
                      return r;
                    }}
                    onDone={() => router.refresh()}
                  />
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {revoked.length > 0 && (
        <>
          <h3 className="admin-section-label u-mt-4">Removed</h3>
          <div className="admin-list">
            {revoked.map((u) => (
              <div className="admin-list-row" key={u.personId}>
                <div className="admin-list-main">
                  <div className="admin-list-title">{u.name}</div>
                  <div className="admin-list-sub">{u.email} · access removed</div>
                </div>
                <div className="admin-list-aside">
                  <button
                    type="button"
                    className="admin-btn admin-btn--sm"
                    disabled={pending}
                    onClick={() => run(() => inviteUserAction({ companyId, name: u.name, email: u.email, role: u.role }))}
                  >
                    Re-invite
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {msg && <div className="admin-alert u-mt-3">{msg}</div>}
      {err && <div className="admin-alert admin-alert--err u-mt-3">{err}</div>}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  invitePortalMember,
  resendPortalMemberInvite,
  revokePortalMember,
  setContactEmailAndInvite,
  setPortalMemberRole,
  setPortalMemberTempPassword,
} from "@/entities/crm/lib/portal-member-actions";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";

type Result = { ok: true; message: string } | { ok: false; error: string };

// Client-portal access controls for one (person, company) pair. Sibling of
// InvitePortalButton (the /team one), but membership-based: Invite confirms
// first (it emails a real sign-in link); an active member gets Resend + Revoke.
export function PortalMemberControls({
  personId,
  companyId,
  active,
  role,
  hasEmail = true,
}: {
  personId: string;
  companyId: string;
  active: boolean;
  // Current portal role; picker shown for active members (PR 2 roles).
  role?: string;
  // False when people.email is only an import placeholder: the row asks for a
  // real address before it can invite.
  hasEmail?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  // The generated temp password, shown once after issuing. Held only in this
  // component's state — never refetched — so leaving the row clears it.
  const [tempPw, setTempPw] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState("");

  // The confirmed actions run through ConfirmButton, whose modal shows the
  // action's error itself; only the success message lands in the inline slot.
  async function run(action: () => Promise<Result>): Promise<Result> {
    setMsg(null);
    const res = await action();
    if (res.ok) setMsg(res.message);
    return res;
  }

  async function issueTempPassword(): Promise<Result> {
    setMsg(null);
    setTempPw(null);
    setCopied(false);
    const res = await setPortalMemberTempPassword(personId, companyId);
    if (res.ok) {
      setMsg(res.message);
      setTempPw(res.password);
    }
    return res;
  }

  if (active) {
    return (
      <span className="u-row u-wrap">
        <span className="admin-badge admin-badge--ok">Portal ✓</span>
        <select
          className="admin-select admin-select--sm"
          value={role ?? "admin"}
          disabled={pending}
          aria-label="Portal role"
          onChange={(e) => {
            const next = e.target.value;
            setMsg(null);
            start(async () => {
              const res = await setPortalMemberRole(personId, companyId, next);
              setMsg(res.ok ? res.message : res.error);
              if (res.ok) router.refresh();
            });
          }}
        >
          <option value="admin">Admin</option>
          <option value="contributor">Contributor</option>
          <option value="viewer">Viewer</option>
        </select>
        <ConfirmButton
          label="Resend link"
          className="admin-btn admin-btn--sm"
          title="Resend the sign-in link?"
          body="Emails this contact a fresh sign-in link."
          confirmLabel="Send"
          disabled={pending}
          onConfirm={() => run(() => resendPortalMemberInvite(personId, companyId))}
          onDone={() => router.refresh()}
        />
        <ConfirmButton
          label="Set temp password"
          className="admin-btn admin-btn--sm"
          title="Set a temporary password?"
          body="Generates a temporary password for this contact and emails it to them. They must change it on first sign-in. Use this for clients whose mail security eats sign-in links."
          confirmLabel="Generate and email"
          disabled={pending}
          onConfirm={issueTempPassword}
          onDone={() => router.refresh()}
        />
        <ConfirmButton
          label="Revoke"
          className="admin-btn admin-btn--sm admin-btn--danger"
          title="Revoke portal access for this company?"
          body="If it is their last membership they are signed out and blocked until re-invited."
          confirmLabel="Revoke"
          disabled={pending}
          onConfirm={() => run(() => revokePortalMember(personId, companyId))}
          onDone={() => router.refresh()}
        />
        {msg && <span className="admin-cell-muted">{msg}</span>}
        {tempPw && (
          <span
            className="admin-alert admin-alert--ok u-w-full u-row u-wrap"
          >
            <span>Temporary password:</span>
            <code className="admin-code">
              {tempPw}
            </code>
            <button
              type="button"
              className="admin-btn admin-btn--sm"
              onClick={() => {
                navigator.clipboard?.writeText(tempPw).then(
                  () => setCopied(true),
                  () => setCopied(false),
                );
              }}
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
            <button type="button" className="admin-btn admin-btn--sm" onClick={() => setTempPw(null)}>
              Done
            </button>
            <span className="admin-cell-muted u-w-full">
              Shown once. The client must change it on first sign-in.
            </span>
          </span>
        )}
      </span>
    );
  }

  if (!hasEmail) {
    return (
      <span className="u-row">
        <input
          className="admin-input admin-input--sm"
          type="email"
          placeholder="Add email to invite"
          aria-label="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <ConfirmButton
          label="Save and invite"
          className="admin-btn admin-btn--sm"
          title="Save this email and invite?"
          body={`Saves ${email.trim() || "the address"} on the contact and sends a client-portal invite to it.`}
          confirmLabel="Save and invite"
          disabled={!email.trim()}
          onConfirm={() => run(() => setContactEmailAndInvite(personId, companyId, email))}
          onDone={() => router.refresh()}
        />
        {msg && <span className="admin-cell-muted">{msg}</span>}
      </span>
    );
  }

  return (
    <span className="u-row">
      <ConfirmButton
        label="Invite to portal"
        className="admin-btn admin-btn--sm"
        title="Invite to the client portal?"
        body="Sends this contact a client-portal invite by email."
        confirmLabel="Send invite"
        onConfirm={() => run(() => invitePortalMember(personId, companyId))}
        onDone={() => router.refresh()}
      />
      {msg && <span className="admin-cell-muted">{msg}</span>}
    </span>
  );
}

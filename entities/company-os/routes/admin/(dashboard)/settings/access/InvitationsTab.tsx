"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/kernel/ui/Badge";
import type { MayProp } from "@/kernel/identity/may-prop";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { formatDate } from "@/kernel/ui/format";
import { showToast } from "@/kernel/ui/Toast";
import type { Invitation } from "@/entities/company-os/lib/access-invitations";
import { cancelInviteAction, resendInviteAction } from "@/entities/company-os/lib/access-invite-actions";

// The Invitations tab (AE.4): everyone invited from Settings → Access who has
// not signed in. Readable with access.explain; Resend and Cancel only render
// for someone holding access.manage, and the actions ask again.
export function InvitationsTab({ invitations, may, lifetimeHours }: { invitations: Invitation[]; may: MayProp; lifetimeHours: number }) {
  const manages = may["access.manage"] === true;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [why, setWhy] = useState("");

  return (
    <div className="admin-card admin-section-card">
      <p className="u-muted u-mb-3">
        Invited and not yet signed in. A link works for {lifetimeHours} hours (the project&apos;s email link lifetime); after that the row reads
        Expired and Resend sends a fresh one.
      </p>
      {invitations.length === 0 ? (
        <p className="u-muted">No invitations are waiting.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Holds</th>
                <th>Invited by</th>
                <th>Sent</th>
                <th>Status</th>
                {manages && <th />}
              </tr>
            </thead>
            <tbody>
              {invitations.map((i) => (
                <tr key={i.authUserId}>
                  <td>
                    <strong>{i.name}</strong>
                    <div className="admin-hint">{i.email}</div>
                  </td>
                  <td>{i.roles.length > 0 ? i.roles.join(", ") : <span className="u-muted">Nothing granted</span>}</td>
                  <td>{i.inviter ?? <span className="u-muted">Unknown</span>}</td>
                  <td className="u-nowrap">{formatDate(i.sentAt)}</td>
                  <td>{i.status === "Expired" ? <Badge tone="warn">Expired</Badge> : <Badge tone="info">Sent</Badge>}</td>
                  {manages && (
                    <td className="u-right u-nowrap">
                      <button
                        type="button"
                        className="admin-btn admin-btn--sm u-mr-2"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const res = await resendInviteAction(i.authUserId);
                            showToast({ message: res.ok ? res.message : res.error });
                            if (res.ok) router.refresh();
                          })
                        }
                      >
                        Resend
                      </button>
                      <ConfirmButton
                        label="Cancel"
                        className="admin-btn admin-btn--sm admin-btn--danger"
                        title={`Cancel the invitation to ${i.name}?`}
                        body={
                          <>
                            <p>
                              Every role the invite granted is revoked and the unused login is deleted. {i.name}&apos;s People and team records stay.
                            </p>
                            <label className="admin-field">
                              <span className="admin-label">Why it is cancelled</span>
                              <input className="admin-input" value={why} onChange={(e) => setWhy(e.target.value)} />
                            </label>
                          </>
                        }
                        confirmLabel="Cancel invitation"
                        disabled={pending}
                        onConfirm={() => cancelInviteAction(i.authUserId, why)}
                        onDone={() => {
                          setWhy("");
                          router.refresh();
                        }}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

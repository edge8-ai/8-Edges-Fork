"use client";

import { useState, useTransition } from "react";
import type { AssumableClient } from "@/entities/company-os/lib/portal-assume";


// "View as" launches the client portal scoped to that company, in this same
// browser tab — your admin session stays logged in underneath. A banner on
// every /portal page shows who you're viewing as and lets you exit back here.
// Companies with portal users get a member picker: the session carries that
// member's real role, so a contributor pick shows the contributor view.
// Companies without portal users fall back to the primary CRM contact (admin
// view), matching the original behavior.

function companyInitials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => w[0] ?? "");
  return letters.join("").toUpperCase() || "?";
}

export function AssumeManager({
  clients,
  startAssumeSession,
}: {
  clients: AssumableClient[];
  // crm owns the assume session, and its server door builds the service-role
  // client, so the action arrives as a prop from the page rather than as an
  // import into this bundle.
  startAssumeSession: (companyId: string, personId?: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  // companyId -> selected personId; defaults to the first member per company.
  const [selected, setSelected] = useState<Record<string, string>>({});

  function handleView(companyId: string, personId?: string) {
    setError(null);
    setPendingId(companyId);
    start(async () => {
      const res = await startAssumeSession(companyId, personId);
      // startAssumeSession redirects on success, so reaching here means it failed.
      if (res && !res.ok) setError(res.error ?? "Could not start the session.");
      setPendingId(null);
    });
  }

  return (
    <>
      {error && <div className="admin-alert admin-alert--err">{error}</div>}

      <div className="admin-list">
        {clients.length === 0 ? (
          <div className="admin-empty">No active client-portal companies yet.</div>
        ) : (
          clients.map((c) => {
            const hasMembers = c.members.length > 0;
            const contactLabel = c.contactName || c.contactEmail;
            const canAssume = hasMembers || Boolean(c.contactEmail);
            const selectedPersonId = selected[c.companyId] ?? c.members[0]?.personId;
            return (
              <div className="admin-list-row admin-assume-row" key={c.companyId}>
                <div className="admin-list-main admin-assume-main">
                  <span className="admin-assume-logo" aria-hidden>
                    {companyInitials(c.companyName)}
                  </span>
                  <div className="admin-assume-main-text">
                    <div className="admin-list-title">{c.companyName}</div>
                    <div className="admin-list-sub">
                      {hasMembers
                        ? `${c.members.length} portal ${c.members.length === 1 ? "user" : "users"}`
                        : contactLabel
                          ? `No portal users yet · opens as primary contact ${contactLabel}`
                          : "Link a contact in the CRM to view this portal"}
                    </div>
                  </div>
                </div>
                <div className="admin-assume-controls">
                  {hasMembers && (
                    <select
                      className="admin-select admin-assume-select"
                      aria-label={`View ${c.companyName} as`}
                      value={selectedPersonId}
                      onChange={(e) =>
                        setSelected((s) => ({ ...s, [c.companyId]: e.target.value }))
                      }
                    >
                      {c.members.map((m) => (
                        <option key={m.personId} value={m.personId}>
                          {m.name} ({m.role})
                        </option>
                      ))}
                    </select>
                  )}
                  {canAssume ? (
                    <button
                      className="admin-btn admin-btn--sm admin-btn--primary"
                      disabled={pending}
                      onClick={() => handleView(c.companyId, hasMembers ? selectedPersonId : undefined)}
                    >
                      {pending && pendingId === c.companyId ? "Opening…" : "View as"}
                    </button>
                  ) : (
                    <span className="admin-badge">No linked contact</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

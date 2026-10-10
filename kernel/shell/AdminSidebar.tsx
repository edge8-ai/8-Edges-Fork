"use client";

import { useEffect, useState, type ReactNode } from "react";

// The Admin surface's sidebar: the shell's chrome, rendering whatever
// navigation the composition root hands it (ADR 0002). It owns no rows of its
// own — the information architecture is kernel/shell/admin-ia.ts and the rows
// come from the installed entities' contributions, composed in app/nav.ts — and
// it names no entity, which is what lets it live in the kernel.
//
// `enabled: false` items render muted with a "soon" tag and are not navigable,
// so the shell looks complete before a route exists. The Admin layout hands
// over only the rows the viewer may open (ADR 0013).
import type { NavSection } from "./nav";
import { AdminNav } from "./AdminNav";
import { AdminProfileMenu } from "./AdminProfileMenu";

// No name/profile record yet, so derive a monogram from the email local part:
// "jane.doe@…" -> "JD", "jane@…" -> "JA".
function initials(email: string): string {
  const local = (email.split("@")[0] || email).trim();
  const parts = local.split(/[.\-_]+/).filter(Boolean);
  const raw = parts.length >= 2 ? parts[0][0] + parts[1][0] : local.slice(0, 2);
  return raw.toUpperCase();
}

export function AdminSidebar({
  sections,
  signOut,
  user,
  avatarUrl,
  canSwitchToTeam,
  search,
  inboxHref,
}: {
  sections: NavSection[];
  // The sign-out action belongs to whichever entity owns the admin session, so
  // the shell takes it rather than importing one (the kernel may name no
  // entity, and a server action cannot cross into a client component any other
  // way).
  signOut: () => void | Promise<void>;
  user: { email: string };
  avatarUrl: string | null;
  canSwitchToTeam: boolean;
  // The search palette's row (S.1), handed in by the layout for the same reason
  // as signOut: its action is generated in app/, which the kernel cannot import.
  search: ReactNode;
  // The inbox's address (S.3), from the generated app/shell.ts: the kernel may
  // not name the entity that owns it, and a deployment without one draws no envelope.
  inboxHref: string | null;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const userInitials = initials(user.email);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" && setProfileMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [profileMenuOpen]);

  return (
    <>
      <div className="admin-mobilebar">
        <button
          className="admin-mobile-toggle"
          aria-label="Open navigation"
          onClick={() => setNavOpen(true)}
        >
          ☰
        </button>
        <strong>8 Edges</strong>
      </div>

      {navOpen && (
        <div className="admin-scrim" onClick={() => setNavOpen(false)} />
      )}

      <nav
        className={`admin-sidebar${navOpen ? " is-open" : ""}`}
        aria-label="Admin"
      >
        <div className="admin-brand">
          <span className="admin-brand-lead">8 Edges</span>
          <span className="admin-brand-actions">
            {inboxHref && (
              <a className="admin-iconbtn" href={inboxHref} aria-label="Inbox" title="Inbox">
                ✉
              </a>
            )}
            <button
              type="button"
              className="admin-avatarbtn"
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
              aria-label="Profile and views"
              onClick={() => {
                setProfileMenuOpen((v) => !v);
              }}
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- uploaded file of unknown size; next/image needs fixed dimensions
                <img src={avatarUrl} alt="" />
              ) : (
                userInitials
              )}
            </button>
          </span>
        </div>

        {profileMenuOpen && (
          <AdminProfileMenu
            user={user}
            avatarUrl={avatarUrl}
            userInitials={userInitials}
            canSwitchToTeam={canSwitchToTeam}
            signOut={signOut}
            onClose={() => setProfileMenuOpen(false)}
          />
        )}

        {search}

        <AdminNav
          sections={sections}
          onNavigate={() => setNavOpen(false)}
        />
      </nav>
    </>
  );
}

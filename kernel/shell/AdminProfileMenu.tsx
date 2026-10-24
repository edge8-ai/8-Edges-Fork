"use client";

import Link from "next/link";

// The Admin sidebar's profile menu: who is signed in, the view switcher between
// the two apps, and sign out. Split out of AdminSidebar with the nav tree so
// each file stays readable.

// The views a user can land in. Admin and Team are SEPARATE apps (/admin and
// /team); the switcher navigates between them rather than re-scoping /admin.
// `current` marks where we are now. "Team" is only live for admins who also
// have a linked, active team_members record (see hasTeamAccess() in
// kernel/identity/team-auth.ts) — everyone else sees it disabled.
type View = {
  key: string;
  label: string;
  ico: string;
  href: string;
  current?: boolean;
};
const VIEWS: View[] = [
  { key: "admin", label: "Admin", ico: "◈", href: "/admin", current: true },
  { key: "team", label: "Team", ico: "☷", href: "/team" },
];

export function AdminProfileMenu({
  user,
  avatarUrl,
  userInitials,
  canSwitchToTeam,
  signOut,
  onClose,
}: {
  user: { email: string };
  avatarUrl: string | null;
  userInitials: string;
  canSwitchToTeam: boolean;
  signOut: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <>
      <div className="admin-profilemenu-backdrop" onClick={onClose} />
      <div
        className="admin-profilemenu"
        role="menu"
        aria-label="Profile and views"
      >
        <div className="admin-profilemenu-head">
          <span className="admin-avatarbtn admin-avatarbtn--lg" aria-hidden>
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- uploaded file of unknown size; next/image needs fixed dimensions
              <img src={avatarUrl} alt="" />
            ) : (
              userInitials
            )}
          </span>
          <span className="admin-profilemenu-email">{user.email}</span>
        </div>

        <div className="admin-profilemenu-label">Switch view</div>
        {VIEWS.map((v) => {
          if (v.current) {
            return (
              <span
                key={v.key}
                className="admin-profilemenu-item"
                role="menuitem"
                aria-current="true"
              >
                <span className="admin-profilemenu-ico" aria-hidden>
                  {v.ico}
                </span>
                {v.label}
                <span className="admin-profilemenu-here">Current</span>
              </span>
            );
          }
          const live = v.key === "team" ? canSwitchToTeam : false;
          if (live) {
            return (
              <Link
                key={v.key}
                href={v.href}
                className="admin-profilemenu-item"
                role="menuitem"
                onClick={onClose}
              >
                <span className="admin-profilemenu-ico" aria-hidden>
                  {v.ico}
                </span>
                {v.label}
              </Link>
            );
          }
          return (
            <span
              key={v.key}
              className="admin-profilemenu-item is-disabled"
              role="menuitem"
              aria-disabled
              title="No linked team account"
            >
              <span className="admin-profilemenu-ico" aria-hidden>
                {v.ico}
              </span>
              {v.label}
              <span className="admin-nav-badge">n/a</span>
            </span>
          );
        })}

        <div className="admin-profilemenu-sep" />

        <span
          className="admin-profilemenu-item is-disabled"
          role="menuitem"
          aria-disabled
          title="Coming soon"
        >
          <span className="admin-profilemenu-ico" aria-hidden>
            ☺
          </span>
          My profile
          <span className="admin-nav-badge">soon</span>
        </span>

        <form action={signOut}>
          <button
            type="submit"
            className="admin-signout admin-profilemenu-signout"
          >
            Sign out
          </button>
        </form>
      </div>
    </>
  );
}

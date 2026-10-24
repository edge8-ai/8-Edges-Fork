"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signOut } from "@/entities/team/lib/actions";
import { initials } from "@/kernel/ui/format";
import { Avatar } from "@/kernel/ui/Avatar";

// The avatar button in the team sidebar's brand row and the menu it opens:
// who is signed in, the switch between the Team and Admin views, and Sign out.
// Moved out of TeamSidebar when TH.5 gave the sidebar a phone bar of its own.
//
// The face on the button is the reader's own, and it wears the border they
// chose to show (LD.4), so they see what teammates see. The layout reads it
// through the kernel's faces seam and passes null when nothing is worn, when
// the reader's game style is off, or when the deployment has no ladders.

// Mirror of AdminSidebar's VIEWS: Admin and Team are separate apps, the
// switcher navigates between them. "Admin" is only live for team members who
// may enter the Admin view: the layout passes whether they hold surface.admin.
type View = { key: string; label: string; ico: string; href: string; current?: boolean };
const VIEWS: View[] = [
  { key: "team", label: "Team", ico: "☷", href: "/team", current: true },
  { key: "admin", label: "Admin", ico: "◈", href: "/admin" },
];

export function TeamProfileMenu({
  name,
  avatarUrl,
  isAdmin,
  border = null,
}: {
  name: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  /** The reader's own worn Learn & Share tier, or null for a plain face. */
  border?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const userInitials = initials(name);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const avatar = avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- uploaded file of unknown size; next/image needs fixed dimensions
    <img src={avatarUrl} alt="" />
  ) : (
    userInitials
  );

  return (
    <>
      <div className="admin-brand">
        <span className="admin-brand-lead">Edge8 Team</span>
        <span className="admin-brand-actions">
          <button
            type="button"
            className={border ? "admin-avatarbtn admin-avatarbtn--framed" : "admin-avatarbtn"}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label="Switch view"
            onClick={() => setOpen((v) => !v)}
          >
            {border ? <Avatar className="admin-avatarbtn-face" name={name} initials={userInitials} photoUrl={avatarUrl} border={border} decorative /> : avatar}
          </button>
        </span>
      </div>

      {open && <div className="admin-profilemenu-backdrop" onClick={() => setOpen(false)} />}
      {open && (
        <div className="admin-profilemenu" role="menu" aria-label="Switch view">
          <div className="admin-profilemenu-head">
            <span className="admin-avatarbtn admin-avatarbtn--lg" aria-hidden>
              {avatar}
            </span>
            <span className="admin-profilemenu-email">{name}</span>
          </div>

          <div className="admin-profilemenu-label">Switch view</div>
          {VIEWS.map((v) => {
            if (v.current) {
              return (
                <span key={v.key} className="admin-profilemenu-item" role="menuitem" aria-current="true">
                  <span className="admin-profilemenu-ico" aria-hidden>
                    {v.ico}
                  </span>
                  {v.label}
                  <span className="admin-profilemenu-here">Current</span>
                </span>
              );
            }
            const live = v.key === "admin" ? isAdmin : false;
            if (live) {
              return (
                <Link
                  key={v.key}
                  href={v.href}
                  className="admin-profilemenu-item"
                  role="menuitem"
                  onClick={() => setOpen(false)}
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
                title="Not an admin"
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

          <form action={signOut}>
            <button type="submit" className="admin-signout admin-profilemenu-signout">
              Sign out
            </button>
          </form>
        </div>
      )}
    </>
  );
}

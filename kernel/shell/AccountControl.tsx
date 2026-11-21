"use client";

import { useCallback, useRef, useState } from "react";
import { Avatar } from "@/kernel/ui/Avatar";
import { initials } from "@/kernel/ui/format";
import { AccountMenu } from "./AccountMenu";
import type { AppView } from "./app-views";
import { NavIcon } from "./NavIcon";

// The account at the foot of every signed-in sidebar (TH.29): the reader's
// face, name and email in one row that runs the sidebar's width, and the menu
// it opens (./AccountMenu). A row, not the face alone: a menu opens from the
// edge of what was pressed, and only a row reaches the sidebar's edge, so the
// menu beside it reads as coming out of it (shadcn's NavUser, which Dave's
// reference is drawn from, does the same). Folded, the sidebar is too narrow
// for a name, and the face alone is the row.

export function AccountControl({
  name,
  email = null,
  monogram,
  avatarUrl,
  border = null,
  views,
  profileHref,
  signOut,
  signOutLabel,
  compact = false,
}: {
  name: string;
  email?: string | null;
  /** The face's letters when there is no photo; the name's initials when left out. */
  monogram?: string;
  avatarUrl: string | null;
  /** The reader's own worn Learn & Share tier (LD.4), or null for a plain face. */
  border?: string | null;
  views: AppView[];
  profileHref: string | null;
  signOut: () => void | Promise<void>;
  signOutLabel?: string;
  /** The folded sidebar's face alone. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const rowRef = useRef<HTMLButtonElement>(null);
  const face = (
    <Avatar
      className="shell-account-avatar"
      name={name}
      initials={monogram ?? initials(name)}
      photoUrl={avatarUrl}
      border={border}
      decorative
    />
  );
  // The address under the name, once for the row and its menu; left out when
  // there is none or it is the name already (an admin with no name on record).
  const subline = email && email !== name ? email : null;

  return (
    <div>
      {open && (
        <AccountMenu
          name={name}
          subline={subline}
          face={face}
          views={views}
          profileHref={profileHref}
          signOut={signOut}
          signOutLabel={signOutLabel}
          onClose={close}
          openerRef={rowRef}
        />
      )}
      <button
        ref={rowRef}
        type="button"
        className={`shell-account${compact ? " is-compact" : ""}${open ? " is-open" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Your account"
        onClick={() => setOpen((v) => !v)}
      >
        {face}
        {!compact && (
          <>
            <span className="shell-account-who">
              <span className="shell-account-name">{name}</span>
              {subline && <span className="shell-account-email">{subline}</span>}
            </span>
            <span className="shell-account-updown" aria-hidden>
              <NavIcon name="upDown" />
            </span>
          </>
        )}
      </button>
    </div>
  );
}

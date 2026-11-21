"use client";

import { useState } from "react";
import Link from "next/link";

// The card drawer's action row: Copy link, Archive and, on a many-board scope,
// the way through to the card's own board. A saved card has no Save: its edits
// save themselves and the header says so (TH.3.2). A new card's row is the
// canvas's (W.159): Cancel and Create card, at the right. Split out of
// CardDrawer to keep that file under the size cap (W.141); the copied-state is
// the row's own and nothing else reads it.
//
// On a phone this row is not drawn: the same actions sit in the bottom bar's
// ⋯ menu (CardDrawerBottomBar, W.183), which is always on screen.

/** "Copy link" and its two-second "Link copied ✓", for the row and the phone's menu. */
export function useCopyLink(shareUrl: string | null) {
  const [copied, setCopied] = useState(false);
  function copy() {
    if (!shareUrl) return;
    navigator.clipboard?.writeText(`${window.location.origin}${shareUrl}`).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {}, // clipboard can be blocked; the link is still visible via Open board
    );
  }
  return { copied, copy };
}

export function CardDrawerActions({
  isNew,
  saving,
  shareUrl,
  boardHref,
  onSave,
  onArchive,
  onCancel,
}: {
  isNew: boolean;
  saving: boolean;
  /** The card's own shareable link (board page + ?card=), for "Copy link". */
  shareUrl: string | null;
  /** Where the card's own board page is, on a many-board scope; null hides the link. */
  boardHref: string | null;
  onSave: () => void;
  onArchive: () => void;
  /** Closes a new card unmade, through the same guard as the drawer's ×. */
  onCancel: () => void;
}) {
  const { copied, copy: copyLink } = useCopyLink(shareUrl);
  if (isNew) {
    return (
      <div className="admin-form-actions wb-new-card-actions">
        <button className="admin-btn" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button className="admin-btn admin-btn--primary" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Create card"}
        </button>
      </div>
    );
  }
  return (
    <div className="admin-form-actions">
      {shareUrl && (
        <button className="admin-btn" onClick={copyLink} title={`${shareUrl}`}>
          {copied ? "Link copied ✓" : "Copy link"}
        </button>
      )}
      <button className="admin-btn admin-btn--danger" onClick={onArchive} disabled={saving}>
        Archive
      </button>
      {boardHref && (
        <Link className="admin-btn u-ml-auto" href={boardHref}>
          Open board →
        </Link>
      )}
    </div>
  );
}

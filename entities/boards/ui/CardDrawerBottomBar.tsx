"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useMediaQuery } from "@/kernel/ui/hooks/useMediaQuery";
import { useCopyLink } from "./CardDrawerActions";

// The card drawer's bottom bar on a phone (W.183, from Derek's spark).
//
// On a 375×812 phone the drawer's pinned header took 650px, the body had 159px
// to show 883px in, and the page behind cannot scroll, so the comment box and
// Archive at the end of the body were never on screen at all. The drawer now
// scrolls as one column on a phone, and this bar sits under it, always
// visible: the comment box on the left, and a ⋯ menu holding Copy link, Open
// board and Archive, the actions a phone check-in reaches for least.
//
// The comment box is not drawn here. It stays CardActivity's own, which posts
// it, tracks its draft and lists what it posted; CardActivity puts it in this
// bar through a portal when the context below names the bar's slot. One box,
// moved, rather than two that would be two drafts of one comment.

/** The element a phone's comment box is portalled into; null draws it in place. */
export const ComposerHostContext = createContext<HTMLElement | null>(null);

export function useComposerHost(): HTMLElement | null {
  return useContext(ComposerHostContext);
}

/** The phone breakpoint, the same one admin.css lays the drawer out by. */
const PHONE = "(max-width: 640px)";

/**
 * The bar, when there is one: on a phone, for a saved card somebody may edit.
 * A new card keeps its Cancel and Create card row in the body, and a read-only
 * card has nothing to put in a bar. `host` is the comment box's slot, for the
 * drawer to hand CardActivity through ComposerHostContext.
 */
export function usePhoneBar(bar: {
  enabled: boolean;
  shareUrl: string | null;
  boardHref: string | null;
  saving: boolean;
  onArchive: () => void;
}) {
  const phone = useMediaQuery(PHONE);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const on = phone && bar.enabled;
  return {
    on,
    host: on ? host : null,
    footer: on ? (
      <CardDrawerBottomBar
        shareUrl={bar.shareUrl}
        boardHref={bar.boardHref}
        saving={bar.saving}
        onArchive={bar.onArchive}
        composerHost={setHost}
      />
    ) : null,
  };
}

export function CardDrawerBottomBar({
  shareUrl,
  boardHref,
  saving,
  onArchive,
  composerHost,
}: {
  shareUrl: string | null;
  boardHref: string | null;
  saving: boolean;
  onArchive: () => void;
  /** Ref callback for the comment box's slot. */
  composerHost: (el: HTMLDivElement | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const { copied, copy } = useCopyLink(shareUrl);
  const menuId = useId();
  const wrap = useRef<HTMLDivElement>(null);

  // A tap anywhere outside the menu closes it, as a menu does.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Escape closes the menu and not the drawer around it: the drawer skips a
  // key that has been handled inside (escapeHandledInside).
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="wb-drawer-bottombar">
      <div ref={composerHost} className="wb-drawer-bottombar-composer" />
      <div ref={wrap} className="wb-drawer-bottombar-more" onKeyDown={onKeyDown}>
        <button
          type="button"
          className="wb-drawer-bottombar-toggle"
          aria-label="More actions"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((o) => !o)}
        >
          ⋯
        </button>
        {open && (
          <div id={menuId} role="menu" className="wb-drawer-bottombar-menu">
            {shareUrl && (
              <button type="button" role="menuitem" className="wb-drawer-bottombar-item" onClick={copy}>
                {copied ? "Link copied ✓" : "Copy link"}
              </button>
            )}
            {boardHref && (
              <Link role="menuitem" className="wb-drawer-bottombar-item" href={boardHref}>
                Open board →
              </Link>
            )}
            <button
              type="button"
              role="menuitem"
              className="wb-drawer-bottombar-item wb-drawer-bottombar-item--danger"
              disabled={saving}
              onClick={() => {
                setOpen(false);
                onArchive();
              }}
            >
              Archive card
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { Icon } from "@/kernel/ui/Icon";

/**
 * The two ways to add a deliverable, File and Link, as one control (W.163 U8).
 *
 * Wide, they are the two chips the canvas draws. Below 640 px the head of the
 * section has no room for both beside its heading, so they become one "+ Add"
 * button that opens a short list: "Photo, video or file", which is the file
 * input (on a phone that is where Camera, Photos and Files are offered,
 * natively), and "Link". Both forms are in the markup; the stylesheet shows
 * one, so neither depends on measuring the screen in script.
 *
 * Not a <details>: the drawer has no folds (W.92.6), and this is a pair of
 * actions, not hidden content. Escape closes the list and stays here, as the
 * link box's does, rather than closing the card.
 */
export function DeliverableAdds({
  onChooseFile,
  onToggleLink,
  linkOpen,
  fileLabel = "File",
  linkLabel = "Link",
}: {
  onChooseFile: () => void;
  onToggleLink: () => void;
  linkOpen: boolean;
  fileLabel?: string;
  linkLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const choose = (then: () => void) => {
    setOpen(false);
    then();
  };
  // A fragment: the caller's `.wb-deliv-adds` row holds these beside its file input.
  return (
    <>
      <span className="wb-deliv-adds-wide">
        <button type="button" className="wb-add-chip" onClick={onChooseFile}>
          <Icon name="paperclip" /> {fileLabel}
        </button>
        <button type="button" className="wb-add-chip" aria-expanded={linkOpen} onClick={onToggleLink}>
          <Icon name="link" /> {linkLabel}
        </button>
      </span>
      <div
        ref={wrap}
        className="wb-deliv-adds-narrow"
        onBlur={(e) => {
          if (!wrap.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            // The drawer closes on Escape too, unless something inside
            // handled it first (kernel/ui/focus-trap, escapeHandledInside).
            e.preventDefault();
            setOpen(false);
          }
        }}
      >
        <button type="button" className="wb-add-chip" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          + Add
        </button>
        {open && <DeliverableAddMenu onChooseFile={() => choose(onChooseFile)} onLink={() => choose(onToggleLink)} />}
      </div>
    </>
  );
}

/** The short list "+ Add" opens on a narrow screen. */
export function DeliverableAddMenu({ onChooseFile, onLink }: { onChooseFile: () => void; onLink: () => void }) {
  return (
    <ul className="wb-deliv-add-menu" aria-label="Add a deliverable">
      <li>
        <button type="button" className="wb-deliv-add-item" onClick={onChooseFile}>
          <Icon name="paperclip" /> Photo, video or file
        </button>
      </li>
      <li>
        <button type="button" className="wb-deliv-add-item" onClick={onLink}>
          <Icon name="link" /> Link
        </button>
      </li>
    </ul>
  );
}

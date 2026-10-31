"use client";

import { useState } from "react";
import { Icon } from "@/kernel/ui/Icon";
import { FILE_TYPES, isImageType } from "@/entities/boards/lib/deliverable-rules";
import type { Deliverable } from "@/entities/boards/lib/deliverable-types";
import { fileMeta } from "./DeliverableRows";

/**
 * A card's images as the canvas's Content and Phone artboards draw them (W.159):
 * four tiles across, the picture filling each, its name on a small chip at
 * the foot. Khoa chose the grid on 2026-10-26 over the Main artboard's single
 * screenshot row, because the spec says images show as thumbnails and
 * everything else is a named row.
 *
 * A tile opens the image full size. Its size, who added it and when are in
 * the tooltip and in the link's name, since the tile has no room to print
 * them. The pictures are the original bytes, signed for a short time and
 * scaled by the browser, as the rows drew them before.
 */
export function isTileImage(d: Deliverable): boolean {
  return d.kind === "file" && isImageType(d.mimeType) && !!d.previewUrl;
}

export function DeliverableImageGrid({ images, onRemove }: { images: Deliverable[]; onRemove: (d: Deliverable) => void }) {
  if (images.length === 0) return null;
  return (
    <ul className="wb-deliv-grid">
      {images.map((d) => (
        <ImageTile key={d.id} d={d} onRemove={() => onRemove(d)} />
      ))}
    </ul>
  );
}

export function ImageTile({ d, onRemove }: { d: Deliverable; onRemove: () => void }) {
  // Chrome cannot draw a HEIC; the tile then shows the type, as a row would.
  const [broken, setBroken] = useState(false);
  const name = d.filename ?? "Image";
  const meta = fileMeta(d);
  return (
    <li className="wb-deliv-cell">
      <a className="wb-deliv-image" href={d.previewUrl!} target="_blank" rel="noreferrer" title={`${name} · ${meta}`}>
        {broken ? (
          <span className="wb-deliv-image-type" aria-hidden>
            {FILE_TYPES[d.mimeType ?? ""] ?? "IMAGE"}
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived address on another origin; next/image would proxy and cache it
          <img src={d.previewUrl!} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />
        )}
        <span className="wb-deliv-image-name">{name}</span>
        {/* Where the link goes and what the tile leaves out (bug hunt K4). */}
        <span className="u-sr-only">
          , {meta}. Opens full size in a new tab
        </span>
      </a>
      <button type="button" className="wb-deliv-image-remove" aria-label={`Remove ${name}`} onClick={onRemove}>
        <Icon name="close" />
      </button>
    </li>
  );
}

"use client";

import { useRef, useState } from "react";
import { Icon } from "@/kernel/ui/Icon";
import type { Deliverable } from "@/entities/boards/lib/deliverable-types";
import { fileMeta } from "./DeliverableRows";

/**
 * A fresh signed address that fails within this long of being fetched has not
 * expired: the file is what the browser cannot play. Without the bound, every
 * failure would fetch another address (each signing differs) and loop.
 */
const FRESH_FOR_MS = 60_000;

/** Whether a failed video may ask for a fresh address before it is called unplayable. */
export function mayRefreshPreview(lastRefreshAt: number | null, now: number): boolean {
  return lastRefreshAt === null || now - lastRefreshAt >= FRESH_FOR_MS;
}

/** "0:42", "12:05", "1:02:09": a video's length as a player shows it. */
export function clockTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/**
 * A video deliverable (W.156), as the canvas's Content card draws it: a dark
 * tile with a play mark and the video's length, then its name and "plays in
 * the card". Pressing the tile opens the player under the row, in the card.
 *
 * The length is read from the video itself (only its metadata is fetched), so
 * nothing about it is stored. A file the browser cannot decode — QuickTime
 * from an iPhone often is one — says so and offers the download instead of a
 * player that never starts; the browser's own error decides, not a guess from
 * the file type, because many .mov files play perfectly well.
 *
 * The signed address expires after an hour, and an expired one fails the same
 * way an undecodable file does (bug hunt B7, F21). So the first failure asks
 * for a fresh address and tries that before calling the video unplayable; an
 * address that fails within a minute of being fetched is the file itself.
 */
export function VideoRow({
  d,
  onOpen,
  onRemove,
  onRefresh,
}: {
  d: Deliverable;
  onOpen: () => void;
  onRemove: () => void;
  /** Reads the card's list again and returns this video's fresh signed address. */
  onRefresh?: () => Promise<string | null>;
}) {
  const [length, setLength] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [unplayable, setUnplayable] = useState(false);
  const refreshedAt = useRef<number | null>(null);
  const name = d.filename ?? "Video";
  const src = d.previewUrl;

  async function failed(closePlayer: boolean) {
    const now = Date.now();
    if (onRefresh && mayRefreshPreview(refreshedAt.current, now)) {
      refreshedAt.current = now;
      const fresh = await onRefresh().catch(() => null);
      // The new address reaches this row through `d`, and the video tries it.
      if (fresh && fresh !== src) return;
    }
    setUnplayable(true);
    if (closePlayer) setPlaying(false);
  }

  return (
    <li className="wb-deliv-video">
      <div className="wb-deliv-item">
        <button
          type="button"
          className="wb-deliv-tile"
          aria-label={unplayable ? `${name} can't play here` : playing ? `Close the player for ${name}` : `Play ${name}`}
          aria-expanded={playing}
          disabled={!src || unplayable}
          onClick={() => setPlaying((p) => !p)}
        >
          <Icon name="play" />
          {length !== null && <span className="wb-deliv-tile-time">{clockTime(length)}</span>}
        </button>
        {/* The length, read without loading the video: metadata only. */}
        {src && length === null && !unplayable && (
          <video
            className="u-sr-only"
            src={src}
            preload="metadata"
            muted
            aria-hidden
            tabIndex={-1}
            onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setLength(e.currentTarget.duration)}
            onError={() => void failed(false)}
          />
        )}
        <span className="wb-deliv-main wb-deliv-stack">
          <button type="button" className="wb-deliv-open" onClick={onOpen} title={`Download ${name}`}>
            {name}
          </button>
          <span className="wb-deliv-meta">
            {fileMeta(d)} · {unplayable ? "can't play here, download it" : "plays in the card"}
          </span>
        </span>
        {unplayable && (
          <button type="button" className="wb-deliv-text-btn" onClick={onOpen}>
            Download
          </button>
        )}
        <button type="button" className="wb-deliv-remove" aria-label={`Remove ${name}`} onClick={onRemove}>
          <Icon name="close" />
        </button>
      </div>
      {playing && src && !unplayable && (
        <video
          className="wb-deliv-player"
          src={src}
          controls
          autoPlay
          playsInline
          preload="metadata"
          onError={() => void failed(true)}
        >
          {/* No captions track (bug hunt K4): a team's own recordings have none, and an empty track was lint noise that promised captions. */}
        </video>
      )}
    </li>
  );
}

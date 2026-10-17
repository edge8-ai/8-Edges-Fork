"use client";

import { Icon } from "@/kernel/ui/Icon";
import { formatBytes } from "@/kernel/ui/format";
import { businessDate } from "@/kernel/config/dates";
import { FILE_TYPES, isImageType } from "@/entities/boards/lib/deliverable-rules";
import { linkHost, linkLabel, type Deliverable } from "@/entities/boards/lib/deliverable-types";
import { firstName, shortDate } from "./card-chips";
import type { CardUpload } from "./card-uploads";

// The rows of a card's Deliverables section (W.155, W.128), each as the
// canvas draws it: Content card and the Deliverable states artboard.

function RemoveButton({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button type="button" className="wb-deliv-remove" aria-label={label} onClick={onRemove}>
      <Icon name="close" />
    </button>
  );
}

/** "412 KB · Ada · 2 Oct": what a file row says under its name. */
export function fileMeta(d: Pick<Deliverable, "sizeBytes" | "addedBy" | "createdAt">): string {
  return [formatBytes(d.sizeBytes), d.addedBy ? firstName(d.addedBy) : null, shortDate(businessDate(d.createdAt))].filter(Boolean).join(" · ");
}

export function LinkRow({ d, onRemove }: { d: Deliverable; onRemove: () => void }) {
  return (
    <li className="wb-deliv-item">
      <span className="wb-deliv-icon" aria-hidden>
        <Icon name="link" />
      </span>
      <span className="wb-deliv-main">
        <a className="wb-deliv-name" href={d.url ?? undefined} target="_blank" rel="noreferrer">
          {linkLabel(d)}
          {/* Says it leaves for a new tab, as the thumbnail does (bug hunt K4). */}
          <span className="u-sr-only"> (opens in a new tab)</span>
        </a>
        {d.url && <span className="wb-deliv-host"> {linkHost(d.url)}</span>}
      </span>
      <RemoveButton label={`Remove link ${linkLabel(d)}`} onRemove={onRemove} />
    </li>
  );
}

/**
 * A file: an image shows its thumbnail, which opens full size; anything else
 * its type, and its name downloads it. Images are the original bytes, scaled
 * by the browser and loaded lazily (no transformation service in this
 * version); the signed address comes from a different origin than the app.
 */
export function FileRow({ d, onOpen, onRemove }: { d: Deliverable; onOpen: () => void; onRemove: () => void }) {
  const name = d.filename ?? "File";
  const image = isImageType(d.mimeType) && d.previewUrl;
  const badge = FILE_TYPES[d.mimeType ?? ""] ?? "FILE";
  return (
    <li className="wb-deliv-item">
      {image ? (
        <a className="wb-deliv-thumb" href={d.previewUrl!} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived address on another origin; next/image would proxy and cache it */}
          <img src={d.previewUrl!} alt="" loading="lazy" decoding="async" />
          {/* The link's name, including where it goes (bug hunt K4): a new
              tab is a context change, and a screen reader user is otherwise
              left in a window they did not ask for with no cue why. */}
          <span className="u-sr-only">Open {name} full size, in a new tab</span>
        </a>
      ) : (
        <span className={`wb-deliv-type${badge === "PDF" ? " is-pdf" : ""}`} aria-hidden>
          {badge}
        </span>
      )}
      <span className="wb-deliv-main wb-deliv-stack">
        <button type="button" className="wb-deliv-open" onClick={onOpen} title={image ? `Download ${name}` : `Open ${name}`}>
          {name}
        </button>
        <span className="wb-deliv-meta">{fileMeta(d)}</span>
      </span>
      <RemoveButton label={`Remove ${name}`} onRemove={onRemove} />
    </li>
  );
}

/** "310 of 640 MB": whole megabytes, the unit said once, as the canvas has it. */
export function progressNote(sent: number, size: number): string {
  const mb = (n: number) => Math.round(n / (1024 * 1024));
  return `${mb(sent)} of ${mb(size)} MB`;
}

/**
 * What the upload row's status line announces: nothing while bytes are
 * moving (a percentage read out on every tick would drown the page), and
 * "<name> uploaded, checking it" once they have all arrived.
 */
function uploadStatus(u: Pick<Extract<CardUpload, { kind: "uploading" }>, "name" | "phase">): string {
  return u.phase === "checking" ? `${u.name} uploaded, checking it` : "";
}

/** Large enough that a person should know the upload outlives the card. */
const LONG_UPLOAD_BYTES = 25 * 1024 * 1024;

export function UploadRow({ u, onCancel }: { u: Extract<CardUpload, { kind: "uploading" }>; onCancel: () => void }) {
  const pct = u.size > 0 ? Math.round((u.sent / u.size) * 100) : 0;
  const long = u.size >= LONG_UPLOAD_BYTES;
  const note = u.phase === "checking" ? "checking" : long ? progressNote(u.sent, u.size) : u.source;
  return (
    <li className="wb-deliv-item">
      <span className="wb-deliv-type" aria-hidden>
        <Icon name="paperclip" />
      </span>
      <span className="wb-deliv-main wb-deliv-stack">
        <span className="wb-deliv-strong">
          {u.name} <span className="wb-deliv-host">· {note}</span>
        </span>
        <progress className="wb-deliv-bar" value={pct} max={100} aria-label={`Uploading ${u.name}`} />
        {long && <span className="wb-deliv-meta">Keeps going if the connection drops. You can close the card.</span>}
        {/* A progress bar says nothing when it fills (bug hunt K4). This line
            is in the row from the start, empty, so that its change is what a
            screen reader hears: politely, once the bytes are all sent and the
            file moves on to being checked. A refusal or failure after that is
            its own row, which is an alert. */}
        <span className="u-sr-only" role="status" aria-live="polite">
          {uploadStatus(u)}
        </span>
      </span>
      <button type="button" className="wb-deliv-text-btn" onClick={onCancel} disabled={u.phase === "checking"}>
        Cancel
      </button>
    </li>
  );
}

/** A refusal or a failure, in the error colours, with the way forward. */
export function RefusedRow({
  u,
  onDismiss,
  onAddLink,
  onRetry,
}: {
  u: Exclude<CardUpload, { kind: "uploading" }>;
  onDismiss: () => void;
  onAddLink: () => void;
  onRetry: () => void;
}) {
  const title = u.kind === "refused" ? u.refusal.title : `${u.name} didn't upload`;
  const detail = u.kind === "refused" ? u.refusal.detail : u.message;
  const tooLarge = u.kind === "refused" && u.refusal.reason === "too-large";
  return (
    <li className="wb-deliv-item is-refused" role="alert">
      <span className="wb-deliv-type is-refused" aria-hidden>
        <Icon name="alert" />
      </span>
      <span className="wb-deliv-main wb-deliv-stack">
        <span className="wb-deliv-strong">{title}</span>
        <span className="wb-deliv-meta">{detail}</span>
      </span>
      {u.kind === "failed" && (
        <button type="button" className="wb-deliv-text-btn is-refused" onClick={onRetry}>
          Try again
        </button>
      )}
      {tooLarge ? (
        <button
          type="button"
          className="wb-deliv-text-btn is-refused"
          onClick={() => {
            onDismiss();
            onAddLink();
          }}
        >
          Add a link
        </button>
      ) : (
        <RemoveButton label="Dismiss" onRemove={onDismiss} />
      )}
    </li>
  );
}

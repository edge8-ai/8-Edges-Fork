"use client";

import { useState } from "react";
import { zipSync } from "fflate";
import {
  readyToPostBundle,
  readyToPostMessage,
  type PostBundle,
  type ReadyToPostImage,
} from "@/entities/campaigns/lib/ready-to-post";

// Ready to post (R3.346): one press copies the post's text and downloads its
// images in the shape the platform takes. lib/ready-to-post.ts decides what
// downloads; this button fetches the stored files and saves them in the
// browser, so there is no route or server action behind it. The calendar
// drawer and the asset page both use it, each showing the message where it
// shows its other notes.

export type ReadyToPostNote = { tone: "ok" | "warn" | "err"; text: string };

export function ReadyToPostButton({
  title,
  channel,
  text,
  image,
  makeLabel,
  markPostedHere,
  onNote,
  disabled,
  className = "admin-btn admin-btn--primary",
}: {
  title: string;
  channel: string;
  // The post's text as it is on screen.
  text: string;
  // The post's selected image, or null when it has none.
  image: ReadyToPostImage | null;
  // The button that makes images on this screen, named when there are none.
  makeLabel: string;
  // False where Mark posted is on another screen.
  markPostedHere: boolean;
  onNote: (note: ReadyToPostNote) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function press() {
    const bundle = readyToPostBundle({ title, channel }, image);
    const say = (copied: boolean) => readyToPostMessage(bundle, { channel, copied, markPostedHere, makeLabel });
    // Text alone is not a post: with no images the text is left uncopied, so
    // nothing is pasted by mistake before the images exist.
    if (bundle.kind === "none") {
      onNote(say(false));
      return;
    }
    // The clipboard is written first, while the press still counts as the
    // person's own gesture; Safari refuses a write that comes after a fetch.
    let copied = true;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      copied = false;
    }
    setBusy(true);
    try {
      await download(bundle);
      onNote(say(copied));
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      onNote({
        tone: "err",
        text: `${copied ? "Text copied, but the" : "The"} images could not be downloaded (${why}). Open each image and save it by hand.`,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className={className} disabled={disabled || busy} onClick={press}>
      {busy ? "Downloading…" : "Ready to post"}
    </button>
  );
}

async function download(bundle: Exclude<PostBundle, { kind: "none" }>): Promise<void> {
  if (bundle.kind === "zip") {
    const files = await Promise.all(bundle.files.map(async (f) => [f.name, await fetchBytes(f.url)] as const));
    // PNGs are already compressed, so the zip stores them as they are.
    const zipped = zipSync(Object.fromEntries(files), { level: 0 });
    save(new Blob([new Uint8Array(zipped)], { type: "application/zip" }), bundle.fileName);
    return;
  }
  const res = await fetch(bundle.url);
  if (!res.ok) throw new Error(`${res.status} for ${bundle.fileName}`);
  save(await res.blob(), bundle.fileName);
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} for ${url.split(/[?#]/)[0].split("/").pop()}`);
  return new Uint8Array(await res.arrayBuffer());
}

// The stored files sit on another origin, where a link's download name is
// ignored, so each is fetched and saved from an object URL under the post's
// own file name.
function save(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next tick: revoking synchronously can beat the click in
  // Safari and the file arrives empty.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

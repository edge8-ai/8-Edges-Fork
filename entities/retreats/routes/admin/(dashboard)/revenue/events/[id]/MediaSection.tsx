"use client";

import { useState } from "react";
import Image from "next/image";
import { type EventMedia } from "@/entities/retreats/client";
import { addEventVideo, moveEventMedia, removeEventMedia, updateEvent, uploadEventImage } from "../actions";

// Cover image + ordered media gallery (images uploaded to the public
// event-media bucket, videos by URL). Everything here writes immediately —
// it's not part of the Save form above.
export function MediaSection({
  eventId,
  coverImageUrl,
  media,
  onChanged,
}: {
  eventId: string;
  coverImageUrl: string | null;
  media: EventMedia[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoCaption, setVideoCaption] = useState("");
  const [imageCaption, setImageCaption] = useState("");

  async function upload(file: File, target: "cover" | "gallery") {
    setBusy(target);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("target", target);
    if (target === "gallery" && imageCaption) fd.set("caption", imageCaption);
    const r = await uploadEventImage(eventId, fd);
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setImageCaption("");
    onChanged();
  }

  async function submitVideo() {
    setBusy("video");
    setError(null);
    const r = await addEventVideo(eventId, videoUrl, videoCaption || null);
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setVideoUrl("");
    setVideoCaption("");
    onChanged();
  }

  async function run(label: string, fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBusy(label);
    setError(null);
    const r = await fn();
    setBusy(null);
    if (!r.ok) return setError(r.error);
    onChanged();
  }

  return (
    <div className="u-mt-4">
      <div className="admin-cell-muted u-mb-2 u-label">
        Cover image
      </div>
      <div className="u-row u-gap-3 u-mb-4">
        {coverImageUrl ? (
          <Image
            src={coverImageUrl}
            alt="Cover"
            width={96}
            height={64}
            className="admin-img-thumb"
          />
        ) : (
          <span className="admin-cell-muted">None. The signup page renders without a hero.</span>
        )}
        <label className="admin-btn u-pointer">
          {busy === "cover" ? "Uploading…" : coverImageUrl ? "Replace" : "Upload"}
          <input
            type="file"
            accept="image/*"
            className="u-hidden-input"
            disabled={busy !== null}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f, "cover");
              e.target.value = "";
            }}
          />
        </label>
        {coverImageUrl && (
          <button
            type="button"
            className="admin-btn"
            disabled={busy !== null}
            onClick={() => run("cover-clear", () => updateEvent(eventId, { cover_image_url: null }))}
          >
            Remove
          </button>
        )}
      </div>

      <div className="admin-cell-muted u-mb-2 u-label">
        Gallery & video
      </div>
      {error && <div className="admin-alert admin-alert--err u-mb-2">{error}</div>}

      {media.length === 0 ? (
        <div className="admin-empty">No media yet.</div>
      ) : (
        <div className="admin-list">
          {media.map((m, i) => (
            <div className="admin-list-row" key={`${m.url}-${i}`}>
              <div className="admin-list-main u-row u-gap-3 u-min-0">
                {m.kind === "image" ? (
                  <Image src={m.url} alt={m.caption ?? ""} width={56} height={40} className="admin-img-thumb admin-img-thumb--sm" />
                ) : (
                  <span className="u-shrink-0">🎬</span>
                )}
                <div className="u-min-0">
                  <div className="admin-list-title u-truncate">
                    {m.caption || m.url}
                  </div>
                  <div className="admin-list-sub">{m.kind}</div>
                </div>
              </div>
              <div className="admin-list-aside u-row u-gap-1">
                <button type="button" className="admin-btn" disabled={busy !== null || i === 0} onClick={() => run("move", () => moveEventMedia(eventId, i, "up"))} aria-label="Move up">
                  ↑
                </button>
                <button
                  type="button"
                  className="admin-btn"
                  disabled={busy !== null || i === media.length - 1}
                  onClick={() => run("move", () => moveEventMedia(eventId, i, "down"))}
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button type="button" className="admin-btn" disabled={busy !== null} onClick={() => run("remove", () => removeEventMedia(eventId, i))}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="u-row u-wrap u-mt-3">
        <input
          className="admin-input u-max-3"
          placeholder="Caption (optional)"
          value={imageCaption}
          onChange={(e) => setImageCaption(e.target.value)}
        />
        <label className="admin-btn u-pointer">
          {busy === "gallery" ? "Uploading…" : "Upload image"}
          <input
            type="file"
            accept="image/*"
            className="u-hidden-input"
            disabled={busy !== null}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f, "gallery");
              e.target.value = "";
            }}
          />
        </label>
      </div>

      <form
        className="u-row u-wrap u-mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          submitVideo();
        }}
      >
        <input
          className="admin-input u-max-4"
          type="url"
          placeholder="YouTube / Vimeo / .mp4 URL"
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          required
        />
        <input
          className="admin-input u-max-3"
          placeholder="Caption (optional)"
          value={videoCaption}
          onChange={(e) => setVideoCaption(e.target.value)}
        />
        <button type="submit" className="admin-btn" disabled={busy !== null}>
          {busy === "video" ? "Adding…" : "Add video"}
        </button>
      </form>
    </div>
  );
}

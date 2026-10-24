"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GALLERY_CATEGORIES, type GalleryPhoto, type TaggablePerson } from "@/entities/site/client";
import {
  createGalleryUpload,
  recordGalleryUpload,
  saveGalleryPhoto,
  removeGalleryPhoto,
  tagGalleryPhotoPerson,
  untagGalleryPhotoPerson,
} from "@/entities/company-os/lib/gallery-actions";
import { PhotoTagPicker } from "@/entities/retreats/client";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";

const ACCEPT = ["image/jpeg", "image/png", "image/webp"];
// Public anon key — mirrors what the supabase browser client sends; harmless if
// the signed-upload endpoint doesn't require it. Absent only in odd env setups.
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type QueueItem = {
  id: number;
  file: File;
  name: string;
  previewUrl: string;
  progress: number; // 0..1
  status: "uploading" | "done" | "error";
  error?: string;
};

// Drag-and-drop gallery uploader (direct-to-storage, real progress) with a
// per-batch category and a category filter over the saved-photo grid.
export function GalleryManager({ photos, taggable }: { photos: GalleryPhoto[]; taggable: TaggablePerson[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);
  const [drag, setDrag] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [uploadCategory, setUploadCategory] = useState("");
  const [filter, setFilter] = useState("");

  function update(id: number, patch: Partial<QueueItem>) {
    setQueue((q) => q.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  // Direct-to-storage: signed upload URL -> PUT the file (progress) -> record.
  async function uploadOne(item: QueueItem, category: string): Promise<void> {
    const signed = await createGalleryUpload(item.file.type);
    if (!signed.ok) {
      update(item.id, { status: "error", error: signed.error });
      return;
    }
    const put = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", signed.signedUrl);
      if (SUPABASE_ANON) xhr.setRequestHeader("apikey", SUPABASE_ANON);
      xhr.setRequestHeader("x-upsert", "false");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) update(item.id, { progress: (e.loaded / e.total) * 0.95 });
      };
      xhr.onload = () =>
        resolve(
          xhr.status >= 200 && xhr.status < 300
            ? { ok: true }
            : { ok: false, error: `Upload failed (${xhr.status}).` },
        );
      xhr.onerror = () => resolve({ ok: false, error: "Network error." });
      const fd = new FormData();
      fd.append("cacheControl", "3600");
      fd.append("", item.file);
      xhr.send(fd);
    });
    if (!put.ok) {
      update(item.id, { status: "error", error: put.error });
      return;
    }
    const rec = await recordGalleryUpload(signed.path, category);
    update(item.id, rec.ok ? { status: "done", progress: 1 } : { status: "error", error: rec.error });
  }

  async function addFiles(files: File[]) {
    const images = files.filter((f) => ACCEPT.includes(f.type));
    if (images.length === 0) return;
    const category = uploadCategory; // snapshot for this batch
    const items: QueueItem[] = images.map((file) => ({
      id: nextId.current++,
      file,
      name: file.name,
      previewUrl: URL.createObjectURL(file),
      progress: 0,
      status: "uploading",
    }));
    setQueue((q) => [...items, ...q]);

    const pending = [...items];
    const worker = async () => {
      for (;;) {
        const it = pending.shift();
        if (!it) return;
        await uploadOne(it, category);
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, pending.length) }, worker));
    router.refresh();
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDrag(false);
    addFiles(Array.from(e.dataTransfer.files));
  }
  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(e.target.files ?? []));
    if (inputRef.current) inputRef.current.value = "";
  }
  function clearFinished() {
    setQueue((q) => {
      q.filter((it) => it.status !== "uploading").forEach((it) => URL.revokeObjectURL(it.previewUrl));
      return q.filter((it) => it.status === "uploading");
    });
  }

  const uploading = queue.some((it) => it.status === "uploading");
  const shown = filter ? photos.filter((p) => p.category === filter) : photos;

  return (
    <>
      <div className="admin-gallery-uploadbar">
        <span className="admin-label u-m-0">Tag new uploads as</span>
        <select className="admin-select u-w-auto" value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)}>
          <option value="">Untagged</option>
          {GALLERY_CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
      </div>

      <div
        className={`admin-gallery-drop${drag ? " is-drag" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
      >
        <span className="admin-gallery-drop-ico" aria-hidden>⬆</span>
        <span className="admin-gallery-drop-title">Drag photos here, or click to browse</span>
        <span className="admin-gallery-drop-sub">JPG, PNG, or WebP · any size</span>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={onPick} />
      </div>

      {queue.length > 0 && (
        <div className="admin-gallery-queue">
          {queue.map((it) => (
            <div className="admin-gallery-queue-item" key={it.id}>
              {/* eslint-disable-next-line @next/next/no-img-element -- blob preview of a queued upload, size unknown */}
              <img className="admin-gallery-queue-thumb" src={it.previewUrl} alt="" />
              <div className="admin-gallery-queue-body">
                <div className="admin-gallery-queue-name">{it.name}</div>
                {it.status === "error" ? (
                  <div className="admin-gallery-queue-err">{it.error}</div>
                ) : (
                  <div className="admin-gallery-bar">
                    <div
                      className={`admin-gallery-bar-fill${it.status === "done" ? " is-done" : ""}`}
                      style={{ width: `${Math.round(it.progress * 100)}%` }} /* layout-ok: data-driven width */
                    />
                  </div>
                )}
              </div>
              <span className={`admin-gallery-queue-status is-${it.status}`}>
                {it.status === "done" ? "✓" : it.status === "error" ? "✕" : `${Math.round(it.progress * 100)}%`}
              </span>
            </div>
          ))}
          {!uploading && (
            <button className="admin-btn admin-btn--sm u-self-start" onClick={clearFinished}>
              Clear
            </button>
          )}
        </div>
      )}

      <div className="admin-tabs u-mt-4" role="tablist" aria-label="Category">
        <button type="button" className={`admin-tab${filter === "" ? " is-active" : ""}`} role="tab" aria-selected={filter === ""} onClick={() => setFilter("")}>
          All ({photos.length})
        </button>
        {GALLERY_CATEGORIES.map((c) => {
          const n = photos.filter((p) => p.category === c.key).length;
          return (
            <button key={c.key} type="button" className={`admin-tab${filter === c.key ? " is-active" : ""}`} role="tab" aria-selected={filter === c.key} onClick={() => setFilter(c.key)}>
              {c.label} ({n})
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <div className="admin-empty">{photos.length === 0 ? "No photos yet. Drop the first one above." : "No photos in this category yet."}</div>
      ) : (
        <div className="admin-gallery-admin-grid">
          {shown.map((p) => (
            <PhotoCard key={p.id} photo={p} taggable={taggable} onChanged={() => router.refresh()} />
          ))}
        </div>
      )}
    </>
  );
}

function PhotoCard({
  photo,
  taggable,
  onChanged,
}: {
  photo: GalleryPhoto;
  taggable: TaggablePerson[];
  onChanged: () => void;
}) {
  const [pending, start] = useTransition();
  const [caption, setCaption] = useState(photo.caption ?? "");
  const [takenOn, setTakenOn] = useState(photo.taken_on ?? "");
  const [category, setCategory] = useState<string>(photo.category ?? "");

  function save(nextCategory = category) {
    if (
      caption === (photo.caption ?? "") &&
      takenOn === (photo.taken_on ?? "") &&
      nextCategory === (photo.category ?? "")
    ) {
      return;
    }
    start(async () => {
      await saveGalleryPhoto(photo.id, caption, takenOn, nextCategory);
      onChanged();
    });
  }

  return (
    <div className="admin-gallery-admin-card">
      {/* eslint-disable-next-line @next/next/no-img-element -- uploaded file of unknown size; next/image needs fixed dimensions */}
      <img src={photo.image_url} alt={caption || "Team photo"} className="admin-gallery-admin-img" loading="lazy" decoding="async" />
      <input
        className="admin-input admin-gallery-admin-cap"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        onBlur={() => save()}
        placeholder="Add a caption"
        disabled={pending}
      />
      <div className="admin-gallery-admin-row">
        <select
          className="admin-select"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            save(e.target.value);
          }}
          disabled={pending}
        >
          <option value="">Untagged</option>
          {GALLERY_CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
      </div>
      <div className="admin-gallery-admin-row">
        <input className="admin-input" type="date" value={takenOn} onChange={(e) => setTakenOn(e.target.value)} onBlur={() => save()} disabled={pending} />
        <ConfirmButton
          label="Delete"
          className="admin-btn admin-btn--sm admin-btn--danger"
          title="Delete this photo?"
          body="It is removed from the gallery and its file is deleted. This cannot be undone."
          confirmLabel="Delete"
          disabled={pending}
          onConfirm={() => removeGalleryPhoto(photo.id)}
          onDone={onChanged}
        />
      </div>
      <div className="admin-gallery-admin-tags">
        <PhotoTagPicker
          photoId={photo.id}
          tags={photo.people ?? []}
          taggable={taggable}
          onAdd={tagGalleryPhotoPerson}
          onRemove={untagGalleryPhotoPerson}
        />
      </div>
    </div>
  );
}

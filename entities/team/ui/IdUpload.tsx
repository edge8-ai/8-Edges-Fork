"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ACTION_UPLOAD_MAX_BYTES, shrinkImage } from "@/kernel/ui/shrink-image";

// One ID-card slot (front or back). The image lives in a private bucket, so it
// is shown via the self-scoped signed-URL route, not a public URL. Picking a
// file uploads immediately (like the avatar) — it is not part of the Save
// button, which only covers text fields.
type UploadResult = { ok: true } | { ok: false; error: string };

export function IdUpload({
  label,
  side,
  hasImage,
  action,
}: {
  label: string;
  side: "front" | "back";
  hasImage: boolean;
  action: (formData: FormData) => Promise<UploadResult>;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [present, setPresent] = useState(hasImage);
  const [bust, setBust] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    startTransition(async () => {
      // A phone photo goes through the server action, which Vercel caps at
      // about 4.5 MB, so it is redrawn smaller first (M1.2).
      const ready = await shrinkImage(file, { maxEdge: 2400 });
      if (ready.size > ACTION_UPLOAD_MAX_BYTES) {
        setError("That file is too large to upload here. Keep a PDF under 4 MB, or take a photo of the card instead.");
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
      const fd = new FormData();
      fd.append("file", ready);
      const res = await action(fd).catch(() => ({ ok: false as const, error: "The upload did not go through. Check your connection and try again." }));
      if (res.ok) {
        setPresent(true);
        setBust((b) => b + 1);
        router.refresh();
      } else {
        setError(res.error);
      }
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    // One track of the `.admin-team-id-slots` grid the editor puts around the
    // pair; the slot needs no styling of its own beyond being that child.
    <div>
      <button
        type="button"
        className={`admin-team-id-drop${present ? " is-present" : ""}`}
        onClick={() => inputRef.current?.click()}
        aria-label={present ? `Replace ${label}` : `Upload ${label}`}
      >
        {present ? (
          // eslint-disable-next-line @next/next/no-img-element -- served through a gated route at unknown size; next/image needs fixed dimensions
          <img src={`/team/profile/id-image/${side}?v=${bust}`} alt={label} className="admin-team-id-thumb" />
        ) : (
          <span className="admin-team-id-ico" aria-hidden>⬆</span>
        )}
        <span className="admin-team-id-label">
          {pending ? "Uploading…" : present ? `${label} · replace` : `Add ${label.toLowerCase()}`}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        hidden
        onChange={onPick}
      />
      {error && <span className="admin-team-avatar-err">{error}</span>}
    </div>
  );
}

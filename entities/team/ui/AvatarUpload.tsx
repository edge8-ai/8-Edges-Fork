"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// Reusable avatar with inline upload. The parent passes a server action that
// receives a FormData (field name "file") and returns the new URL. Used on the
// employee's own /team/profile and on the admin team-member page.
type UploadResult = { ok: true; url: string } | { ok: false; error: string };

export function AvatarUpload({
  name,
  avatarUrl,
  action,
  size = 88,
  editable = true,
}: {
  name: string;
  avatarUrl: string | null;
  action: (formData: FormData) => Promise<UploadResult>;
  size?: number;
  editable?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState(avatarUrl);
  const [error, setError] = useState<string | null>(null);

  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const res = await action(fd);
      if (res.ok) {
        setUrl(res.url);
        router.refresh();
      } else {
        setError(res.error);
      }
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <div className="admin-team-avatar-wrap">
      <div
        className={`admin-avatar admin-avatar--display${editable ? " is-editable" : ""}`}
        style={{ width: size, height: size, fontSize: size / 2.6 }} /* layout-ok: size from props */
        onClick={editable ? () => inputRef.current?.click() : undefined}
        role={editable ? "button" : undefined}
        tabIndex={editable ? 0 : undefined}
        aria-label={editable ? "Change profile photo" : undefined}
        onKeyDown={
          editable
            ? (e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()
            : undefined
        }
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- uploaded file of unknown size; next/image needs fixed dimensions
          <img src={url} alt={name} />
        ) : (
          <span>{initials}</span>
        )}
        {editable && <span className="admin-team-avatar-edit" aria-hidden>{pending ? "…" : "✎"}</span>}
      </div>
      {editable && (
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={onPick}
        />
      )}
      {error && <span className="admin-team-avatar-err">{error}</span>}
    </div>
  );
}

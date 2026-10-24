"use client";

// Picking and uploading a profile photo (shared since TH.9): the admin's
// avatar, and the photo on the employee's own postcard, upload the same way.
// The parent passes a server action that receives a FormData (field "file")
// and returns the new URL.
import { useRef, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { ACTION_UPLOAD_MAX_BYTES, shrinkImage } from "@/kernel/ui/shrink-image";

export type AvatarUploadResult = { ok: true; url: string } | { ok: false; error: string };

export function useAvatarUpload(avatarUrl: string | null, action: (formData: FormData) => Promise<AvatarUploadResult>) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState(avatarUrl);
  const [error, setError] = useState<string | null>(null);

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    startTransition(async () => {
      // A phone photo goes through the server action, which Vercel caps at
      // about 4.5 MB, so it is redrawn smaller first (M1.2).
      const ready = await shrinkImage(file, { maxEdge: 1024 });
      if (ready.size > ACTION_UPLOAD_MAX_BYTES) {
        setError("That photo could not be made small enough to upload. Try another one.");
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
      const fd = new FormData();
      fd.append("file", ready);
      const res = await action(fd).catch(() => ({ ok: false as const, error: "The upload did not go through. Check your connection and try again." }));
      if (res.ok) {
        setUrl(res.url);
        router.refresh();
      } else {
        setError(res.error);
      }
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return { inputRef, pending, url, error, onPick, pick: () => inputRef.current?.click() };
}

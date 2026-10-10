// ID-card image upload: validate -> store in the PRIVATE `id-documents` bucket
// -> point people_sensitive.id_{side}_path at the object. Mirrors lib/avatars.ts
// but the bucket is private (never a public URL) — images are served only via
// short-lived signed URLs to the owner or an admin. AUTHORIZATION IS THE
// CALLER'S JOB: the /team action passes only the actor's own personId.

import { supabase, companyOs } from "@/kernel/data/supabase";
import { selectPeopleSensitive } from "@/entities/contacts";
import { upsertPeopleSensitiveRow } from "@/entities/contacts";

export const ID_DOC_MAX_BYTES = 10 * 1024 * 1024;

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export type IdSide = "front" | "back";
const SIDE_COLUMN: Record<IdSide, "id_front_path" | "id_back_path"> = {
  front: "id_front_path",
  back: "id_back_path",
};

export type IdUploadResult = { ok: true } | { ok: false; error: string };

export async function setPersonIdImage(
  personId: string,
  side: IdSide,
  file: File,
): Promise<IdUploadResult> {
  const ext = MIME_EXT[file.type];
  if (!ext) return { ok: false, error: "Use a JPG, PNG, WebP, or PDF." };
  if (file.size > ID_DOC_MAX_BYTES) return { ok: false, error: "File is too large (max 10 MB)." };
  if (file.size === 0) return { ok: false, error: "That file is empty." };

  const folder = `people/${personId}`;
  const path = `${folder}/${side}-${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from("id-documents")
    .upload(path, buffer, { contentType: file.type });
  if (upErr) return { ok: false, error: "Upload failed. Try again." };

  const column = SIDE_COLUMN[side];
  const { error: dbErr } = await upsertPeopleSensitiveRow(
      { person_id: personId, [column]: path, updated_at: new Date().toISOString() },
      { onConflict: "person_id" },
    );
  if (dbErr) return { ok: false, error: "Could not save the document." };

  // Best-effort cleanup of this side's previous objects; the new one is live.
  const { data: existing, error: existingError } = await supabase.storage.from("id-documents").list(folder);
  if (existingError) console.error("[retreats] id-documents read failed:", existingError.message);
  const stale = (existing ?? [])
    .map((o) => `${folder}/${o.name}`)
    .filter((p) => p !== path && p.startsWith(`${folder}/${side}-`));
  if (stale.length > 0) await supabase.storage.from("id-documents").remove(stale);

  return { ok: true };
}

// Short-lived signed URL for one side, or null if nothing is on file. Caller
// must have already authorized access to this personId.
export async function signedIdUrl(personId: string, side: IdSide): Promise<string | null> {
  const column = SIDE_COLUMN[side];
  const { data: row, error: rowError } = await selectPeopleSensitive(column)
    .eq("person_id", personId)
    .maybeSingle();
  if (rowError) console.error("[retreats] people_sensitive read failed:", rowError.message);
  const path = (row as Record<string, string | null> | null)?.[column] ?? null;
  if (!path) return null;
  const { data, error: idDocumentsError } = await supabase.storage.from("id-documents").createSignedUrl(path, 60);
  if (idDocumentsError) console.error("[retreats] id-documents read failed:", idDocumentsError.message);
  return data?.signedUrl ?? null;
}

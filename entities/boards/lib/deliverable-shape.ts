// How a task_attachments row becomes what the drawer draws (W.155, W.128).
// Server side, and not a "use server" module: those may export nothing but
// async actions, and this is shared by the actions in deliverables.ts and
// deliverable-files.ts.
import { supabase } from "@/kernel/data/supabase";
import { readOr } from "@/kernel/data/read";
import { NAME_COLUMNS, personName, type NamedPerson } from "@/kernel/config/people-name";
import { DELIVERABLES_BUCKET, PREVIEW_SECONDS, VIDEO_SECONDS, isImageType, isVideoType } from "./deliverable-rules";
import type { Deliverable } from "./deliverable-types";

export const DELIVERABLE_COLUMNS = `id, kind, url, title, filename, mime_type, size_bytes, storage_path, created_at, uploader:people!task_attachments_uploaded_by_fkey(${NAME_COLUMNS})`;


export type DeliverableRow = {
  id: string;
  kind: "file" | "link";
  url: string | null;
  title: string | null;
  filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string | null;
  created_at: string;
  uploader: NamedPerson | null;
};

export function shapeDeliverable(r: DeliverableRow, previewUrl: string | null = null): Deliverable {
  return {
    id: r.id,
    kind: r.kind,
    url: r.url,
    title: r.title,
    filename: r.filename,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    previewUrl,
    addedBy: r.uploader ? personName(r.uploader, null) : null,
    createdAt: r.created_at,
  };
}

/**
 * Every image among the rows, signed in ONE call, and every video in another
 * (W.156, for longer), by storage path. Asked when
 * a card opens, never for a whole board. A failed signing is not an empty
 * card: the images are drawn without a thumbnail, and their rows and
 * downloads still work, which is the fallback named here.
 */
export async function signPreviews(rows: DeliverableRow[]): Promise<Map<string, string>> {
  const files = rows.filter((r) => r.kind === "file" && r.storage_path);
  const images = files.filter((r) => isImageType(r.mime_type)).map((r) => r.storage_path as string);
  const videos = files.filter((r) => isVideoType(r.mime_type)).map((r) => r.storage_path as string);
  const preview = new Map<string, string>();
  for (const [paths, seconds] of [
    [images, PREVIEW_SECONDS],
    [videos, VIDEO_SECONDS],
  ] as const) {
    if (paths.length === 0) continue;
    const signed = readOr(
      await supabase.storage.from(DELIVERABLES_BUCKET).createSignedUrls([...paths], seconds),
      "[boards] signing deliverable previews",
      [] as { path: string | null; signedUrl: string }[],
    );
    for (const s of signed) if (s.path && s.signedUrl) preview.set(s.path, s.signedUrl);
  }
  return preview;
}

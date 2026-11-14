// Profile photo upload: validate -> store in the public `avatars` bucket ->
// point people.avatar_url at it. AUTHORIZATION IS THE CALLER'S JOB — the /team
// action passes only the actor's own personId; the admin action passes any
// person after requireAdmin(). Old objects for the person are removed
// best-effort so the bucket doesn't accumulate stale photos.

import { supabase, companyOs } from "@/kernel/data/supabase";
import { updatePeople } from "@/kernel/identity/writes";

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type AvatarResult = { ok: true; url: string } | { ok: false; error: string };

// Photo for the signed-in user's shell avatar, matched on people.auth_user_id
// (same identity rule as the /team gate). Admins without a people record — or
// without a photo — get null and the sidebar falls back to initials.
export async function avatarUrlForAuthUser(authUserId: string): Promise<string | null> {
  const { data, error: peopleError } = await companyOs
    .from("people")
    .select("avatar_url")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (peopleError) console.error("[retreats] people read failed:", peopleError.message);
  return (data?.avatar_url as string | null) ?? null;
}

export async function setPersonAvatar(personId: string, file: File): Promise<AvatarResult> {
  const ext = MIME_EXT[file.type];
  if (!ext) return { ok: false, error: "Use a JPG, PNG, or WebP image." };
  if (file.size > AVATAR_MAX_BYTES) return { ok: false, error: "Image is too large (max 5 MB)." };
  if (file.size === 0) return { ok: false, error: "That file is empty." };

  const folder = `people/${personId}`;
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from("avatars")
    .upload(path, buffer, { contentType: file.type });
  if (upErr) return { ok: false, error: "Upload failed. Try again." };

  const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
  const url = pub.publicUrl;

  const { error: dbErr } = await updatePeople({ avatar_url: url, updated_at: new Date().toISOString() })
    .eq("id", personId);
  if (dbErr) return { ok: false, error: "Could not save the photo." };

  // Best-effort cleanup of previous photos; the new one is already live.
  const { data: existing, error: existingError } = await supabase.storage.from("avatars").list(folder);
  if (existingError) console.error("[retreats] avatars read failed:", existingError.message);
  const stale = (existing ?? [])
    .map((o) => `${folder}/${o.name}`)
    .filter((p) => p !== path);
  if (stale.length > 0) await supabase.storage.from("avatars").remove(stale);

  return { ok: true, url };
}

// Promote an onboarding selfie into the person's public avatar. The selfie is an
// ordinary headshot, not restricted PII, so it belongs in the public `avatars`
// bucket like every other profile photo — not left behind in the private
// `id-documents` store. Copies the object across, points people.avatar_url at
// the public URL, then drops the private original. Best-effort: returns false
// (never throws) so an onboarding submit never fails on this step.
export async function promoteSelfieToAvatar(
  personId: string,
  selfiePath: string,
): Promise<boolean> {
  try {
    const { data: blob, error: dlErr } = await supabase.storage
      .from("id-documents")
      .download(selfiePath);
    if (dlErr || !blob) return false;

    const contentType = blob.type || "image/jpeg";
    const ext = MIME_EXT[contentType] ?? "jpg";
    const folder = `people/${personId}`;
    const path = `${folder}/${crypto.randomUUID()}.${ext}`;
    const buffer = Buffer.from(await blob.arrayBuffer());

    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, buffer, { contentType });
    if (upErr) return false;

    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    const { error: dbErr } = await updatePeople({ avatar_url: pub.publicUrl, updated_at: new Date().toISOString() })
      .eq("id", personId);
    if (dbErr) return false;

    // The headshot now lives in public storage; remove the private copy.
    await supabase.storage.from("id-documents").remove([selfiePath]);
    return true;
  } catch (err) {
    console.error("[avatars] selfie promotion failed:", err);
    return false;
  }
}

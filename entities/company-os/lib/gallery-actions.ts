"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/kernel/identity/access-request";
import {
  signedGalleryUpload,
  recordGalleryPhoto,
  updateGalleryPhoto,
  deleteGalleryPhoto,
  addPhotoTag,
  removePhotoTag,
  type Result,
} from "@/entities/site";

// All gallery writes are admin-only. The team side is read-only.

function revalidate() {
  revalidatePath("/admin/operations/gallery");
  revalidatePath("/team/gallery");
  revalidatePath("/team");
}

// Step 1 of the direct-to-storage upload: hand the client a one-shot signed
// upload URL. The file never passes through the server.
export async function createGalleryUpload(contentType: string) {
  await requirePermission("company-os.operations");
  return signedGalleryUpload(contentType);
}

// Step 2: record the object the client just uploaded, with its category.
export async function recordGalleryUpload(path: string, category: string): Promise<Result> {
  const { user: admin } = await requirePermission("company-os.operations");
  const res = await recordGalleryPhoto(path, admin.email, category);
  if (res.ok) revalidate();
  return res;
}

export async function saveGalleryPhoto(
  id: string,
  caption: string,
  takenOn: string,
  category: string,
): Promise<Result> {
  await requirePermission("company-os.operations");
  const res = await updateGalleryPhoto(id, { caption, taken_on: takenOn, category });
  if (res.ok) revalidate();
  return res;
}

export async function removeGalleryPhoto(id: string): Promise<Result> {
  await requirePermission("company-os.operations");
  const res = await deleteGalleryPhoto(id);
  if (res.ok) revalidate();
  return res;
}

// Tag / untag a person in a photo. tagged_by is left null for admins (they act
// by email, not a people.id).
export async function tagGalleryPhotoPerson(photoId: string, personId: string): Promise<Result> {
  await requirePermission("company-os.operations");
  const res = await addPhotoTag(photoId, personId, null);
  if (res.ok) revalidate();
  return res;
}

export async function untagGalleryPhotoPerson(photoId: string, personId: string): Promise<Result> {
  await requirePermission("company-os.operations");
  const res = await removePhotoTag(photoId, personId);
  if (res.ok) revalidate();
  return res;
}

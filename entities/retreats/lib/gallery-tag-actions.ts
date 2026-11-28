"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { addPhotoTag, removePhotoTag, type Result } from "./gallery";

// Self-serve photo tagging from /team/gallery. Any team member may tag people in
// a company photo (the gallery is company-visible, not per-actor). The gate is
// retreats.gallery-tags plus requireTeamMember(); writes go through ./gallery,
// the one writer of the photo tags. It moved here from team with A.88.5
// (retreats owns the gallery), and its atom took this entity's name with A.89;
// the same people hold it as hold team.culture, the gallery page's atom.

function revalidate() {
  revalidatePath("/team/gallery");
  revalidatePath("/team");
}

export async function tagPhotoPerson(photoId: string, personId: string): Promise<Result> {
  await requirePermission("retreats.gallery-tags");
  const actor = await requireTeamMember();
  const res = await addPhotoTag(photoId, personId, actor.personId);
  if (res.ok) revalidate();
  return res;
}

export async function untagPhotoPerson(photoId: string, personId: string): Promise<Result> {
  await requirePermission("retreats.gallery-tags");
  const res = await removePhotoTag(photoId, personId);
  if (res.ok) revalidate();
  return res;
}

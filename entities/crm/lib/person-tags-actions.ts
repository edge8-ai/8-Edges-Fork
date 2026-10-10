"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { slugify } from "@/kernel/config/slug";
import { deleteTaggables, selectTags, upsertTaggables, upsertTags } from "@/entities/contacts";
import type { Result } from "@/entities/crm/lib/mutations";

// Add or remove a tag on a contact. A tag is found by slug, so typing "vip" on a
// second contact reuses the "VIP" tag instead of creating a twin, and the first
// spelling someone typed stays the label.

export async function addPersonTag(personId: string, label: string): Promise<Result> {
  const { user: admin } = await requirePermission("crm.contacts");
  const clean = label.trim().replace(/\s+/g, " ");
  const slug = slugify(clean);
  if (!slug) return { ok: false, error: "A tag needs at least one letter or number." };

  const { error: tagErr } = await upsertTags({ label: clean, slug }, { onConflict: "slug", ignoreDuplicates: true });
  if (tagErr) return { ok: false, error: tagErr.message };
  const { data: tag, error: readErr } = await selectTags("id").eq("slug", slug).maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!tag) return { ok: false, error: "The tag could not be saved." };

  const { error } = await upsertTaggables(
    { tag_id: tag.id as string, entity_type: "person", entity_id: personId },
    { onConflict: "tag_id,entity_type,entity_id", ignoreDuplicates: true },
  );
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "taggables", recordId: personId, operation: "insert", actor: admin.email, newData: { tag: slug } });
  revalidatePath(`/admin/contacts/${personId}`);
  return { ok: true };
}

export async function removePersonTag(personId: string, tagId: string): Promise<Result> {
  const { user: admin } = await requirePermission("crm.contacts");
  const { error } = await deleteTaggables().eq("tag_id", tagId).eq("entity_type", "person").eq("entity_id", personId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "taggables", recordId: personId, operation: "delete", actor: admin.email, oldData: { tag_id: tagId } });
  revalidatePath(`/admin/contacts/${personId}`);
  return { ok: true };
}

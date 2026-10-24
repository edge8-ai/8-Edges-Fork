// The tags put on people, as crm and campaigns ask about and change them
// (A.64, ADR 0018). A tag is a slug and a label; `taggables` attaches one to
// a record, and the only record kind tagged today is a person
// (entity_type = 'person'), which every question here fixes.
import { companyOs } from "@/kernel/data/supabase";
import { deleteTaggables, upsertTaggables, upsertTags } from "./writes";

/** Every tag's id and label, by label: a picker's options. */
export async function tagOptions() {
  return companyOs.from("tags").select("id, label").order("label");
}

/** Every tag's id and label, in no set order: a lookup of names by id. */
export async function tagLabels() {
  return companyOs.from("tags").select("id, label");
}

/** A tag's id, by slug, or null. */
export async function tagIdBySlug(slug: string) {
  return companyOs.from("tags").select("id").eq("slug", slug).maybeSingle();
}

/** The tags on one person. */
export async function tagsOfPerson(personId: string) {
  return companyOs.from("taggables").select("tags(id, label)").eq("entity_type", "person").eq("entity_id", personId);
}

/** One page (rows from..to, by id) of which tag is on which person: the audience builder. */
export async function personTagsPage(from: number, to: number) {
  return companyOs.from("taggables").select("entity_id, tag_id").eq("entity_type", "person").order("id").range(from, to);
}

/** Create the tag unless one with this slug exists; an existing tag keeps its label. */
export async function ensureTag(label: string, slug: string) {
  return upsertTags({ label, slug }, { onConflict: "slug", ignoreDuplicates: true });
}

/** Put a tag on a person; a second time does nothing. */
export async function tagPerson(tagId: string, personId: string) {
  return upsertTaggables({ tag_id: tagId, entity_type: "person", entity_id: personId }, { onConflict: "tag_id,entity_type,entity_id", ignoreDuplicates: true });
}

/** Take a tag off a person. */
export async function untagPerson(tagId: string, personId: string) {
  return deleteTaggables().eq("tag_id", tagId).eq("entity_type", "person").eq("entity_id", personId);
}

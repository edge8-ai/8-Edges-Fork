import { tagOptions, tagsOfPerson } from "@/entities/contacts";
import { one } from "@/kernel/config/embedded";

// Tags on one person, and every tag that exists (the add box offers them).
// Tags are set by hand on a contact, e.g. a program's students; contacts
// owns the tables, so the reads go through its door.

export type PersonTag = { id: string; label: string };

export async function getPersonTags(personId: string): Promise<{ tags: PersonTag[]; options: PersonTag[] }> {
  const [attached, all] = await Promise.all([
    tagsOfPerson(personId),
    tagOptions(),
  ]);
  if (attached.error) console.error("[crm/person-tags] taggables", attached.error);
  if (all.error) console.error("[crm/person-tags] tags", all.error);

  const tags = (attached.data ?? [])
    .map((r) => one(r.tags))
    .filter((t): t is PersonTag => !!t)
    .sort((a, b) => a.label.localeCompare(b.label));
  return { tags, options: all.data ?? [] };
}

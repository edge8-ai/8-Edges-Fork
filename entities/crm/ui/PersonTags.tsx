import { getPersonTags } from "@/entities/crm/lib/person-tags";
import { PersonTagsCard } from "./PersonTagsCard";

// The contact page's Tags card: loads this person's tags and the tag list, then
// hands them to the interactive card. Kept out of the page so the page's own
// parallel read stays about the relationship history.
export async function PersonTags({ personId }: { personId: string }) {
  const { tags, options } = await getPersonTags(personId);
  return (
    <div className="admin-card admin-section-card">
      <PersonTagsCard personId={personId} tags={tags} options={options} />
    </div>
  );
}

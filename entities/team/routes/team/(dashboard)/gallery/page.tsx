import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { PageHead } from "@/kernel/ui/PageHead";
import { listGalleryPhotos, taggablePeople } from "@/entities/site";
import { GalleryBrowser } from "@/entities/team/ui/GalleryBrowser";

export const metadata = { title: "Gallery", description: "Photos from the Edge8 team." };

// Company photo wall. Company-visible (no per-actor scope); admins add photos in
// /admin/operations/gallery. Public-bucket images, so a plain <img>. Any team
// member can tag the people in a photo.
export default async function TeamGalleryPage() {
  // The page's declared permission (entities/team/permissions.ts, ADR 0013).
  await requirePermission("team.culture");
  await requireTeamMember();
  const [photos, taggable] = await Promise.all([listGalleryPhotos(), taggablePeople()]);

  return (
    <>
      <PageHead
        eyebrow="Company"
        title="Gallery"
        sub={`${photos.length} ${photos.length === 1 ? "photo" : "photos"}`}
      />
      {photos.length === 0 ? (
        <div className="admin-empty">No photos yet. Check back soon.</div>
      ) : (
        <GalleryBrowser photos={photos} taggable={taggable} />
      )}
    </>
  );
}

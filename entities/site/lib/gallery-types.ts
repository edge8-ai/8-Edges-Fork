// The gallery's browser-safe half: the category vocabulary and the row shapes
// the admin manager and the team browser render. The data functions stay in
// ./gallery.ts, which opens the service-role Supabase client; keeping the types
// and constants apart is what lets entities/site/client.ts re-export them into a
// "use client" bundle (multi-entity design §3, "two doors").

// The three photo categories (null = untagged). One shared source of truth.
export const GALLERY_CATEGORIES = [
  { key: "workshops", label: "Workshops" },
  { key: "clients", label: "Clients" },
  { key: "team", label: "Team" },
] as const;
export type GalleryCategory = (typeof GALLERY_CATEGORIES)[number]["key"];
const CATEGORY_KEYS = new Set<string>(GALLERY_CATEGORIES.map((c) => c.key));
export function cleanCategory(v: string | null | undefined): GalleryCategory | null {
  return v && CATEGORY_KEYS.has(v) ? (v as GalleryCategory) : null;
}

// A person tagged in a photo (see gallery_photo_people). name is a display name.
export type TaggedPerson = { person_id: string; name: string; avatar_url: string | null };

export type GalleryPhoto = {
  id: string;
  image_url: string;
  caption: string | null;
  taken_on: string | null;
  category: GalleryCategory | null;
  created_at: string;
  people?: TaggedPerson[]; // who's tagged in it (attached by listGalleryPhotos)
};
export type { Result } from "@/kernel/data/result";

export type TaggablePerson = { person_id: string; name: string; avatar_url: string | null };

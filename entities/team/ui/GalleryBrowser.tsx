"use client";

import { useState } from "react";
import { GALLERY_CATEGORIES, type GalleryPhoto, type TaggablePerson } from "@/entities/site/client";
import { formatDate } from "@/kernel/ui/format";
import { PhotoTagPicker } from "@/entities/retreats/client";
import { tagPhotoPerson, untagPhotoPerson } from "@/entities/team/lib/gallery-actions";

// Client-side category filter over the team photo wall. Small dataset, so the
// tabs filter in memory. Empty categories are hidden from the tab bar. Any team
// member can tag the people in a photo (self-serve).
export function GalleryBrowser({
  photos,
  taggable,
}: {
  photos: GalleryPhoto[];
  taggable: TaggablePerson[];
}) {
  const [filter, setFilter] = useState("");
  const cats = GALLERY_CATEGORIES.map((c) => ({
    ...c,
    count: photos.filter((p) => p.category === c.key).length,
  })).filter((c) => c.count > 0);
  const shown = filter ? photos.filter((p) => p.category === filter) : photos;

  return (
    <>
      {cats.length > 0 && (
        <div className="admin-tabs" role="tablist" aria-label="Category">
          <button type="button" className={`admin-tab${filter === "" ? " is-active" : ""}`} role="tab" aria-selected={filter === ""} onClick={() => setFilter("")}>
            All ({photos.length})
          </button>
          {cats.map((c) => (
            <button key={c.key} type="button" className={`admin-tab${filter === c.key ? " is-active" : ""}`} role="tab" aria-selected={filter === c.key} onClick={() => setFilter(c.key)}>
              {c.label} ({c.count})
            </button>
          ))}
        </div>
      )}

      <div className="admin-gallery-masonry">
        {shown.map((p) => (
          <div key={p.id} className="admin-gallery-tile">
            <a className="admin-gallery-tile-media" href={p.image_url} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element -- uploaded file of unknown size; next/image needs fixed dimensions */}
              <img src={p.image_url} alt={p.caption || "Team photo"} loading="lazy" decoding="async" />
              {(p.caption || p.taken_on) && (
                <span className="admin-gallery-tile-cap">
                  {p.caption}
                  {p.caption && p.taken_on ? " · " : ""}
                  {p.taken_on ? formatDate(p.taken_on) : ""}
                </span>
              )}
            </a>
            <div className="admin-gallery-tile-tags">
              <PhotoTagPicker
                photoId={p.id}
                tags={p.people ?? []}
                taggable={taggable}
                onAdd={tagPhotoPerson}
                onRemove={untagPhotoPerson}
              />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

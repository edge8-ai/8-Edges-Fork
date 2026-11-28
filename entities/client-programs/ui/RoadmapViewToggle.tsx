"use client";

import type { ReactNode } from "react";
import type { BacklogItem, RoadmapGroup } from "@/entities/client-programs/lib/client-backlog";
import { roadmapSections } from "@/entities/client-programs/lib/roadmap-phase";

// Office or Phase: the two ways to read a roadmap. Office is the section view
// (the groups, usually the offices); Phase regroups the same items by the phase
// tag each carries (lib/roadmap-phase.ts). Both roadmap views, the admin
// editor and the client portal, share this switch so they read alike.
export type RoadmapView = "office" | "phase";

export function RoadmapViewToggle({ view, onChange }: { view: RoadmapView; onChange: (v: RoadmapView) => void }) {
  return (
    <div className="admin-viewtoggle u-mb-3" role="group" aria-label="View the roadmap by">
      {(["office", "phase"] as const).map((v) => (
        <button key={v} type="button" className={view === v ? "is-active" : undefined} aria-pressed={view === v} onClick={() => onChange(v)}>
          {v === "office" ? "By office" : "By phase"}
        </button>
      ))}
    </div>
  );
}

// The admin editor's Phase view: one plain section per phase, each item drawn
// by the editor's own row so editing works the same on either axis. Sections
// cannot be renamed or reordered here, because a phase is a tag, not a group.
export function RoadmapPhaseSections({
  items,
  groups,
  renderItem,
}: {
  items: BacklogItem[];
  groups: RoadmapGroup[];
  renderItem: (it: BacklogItem) => ReactNode;
}) {
  return roadmapSections("phase", items, groups).map((s) => (
    <div key={s.key} className="admin-backlog-editor-group">
      <div className="admin-backlog-editor-group-head">
        <span className="admin-backlog-editor-group-title">{s.title}</span>
      </div>
      <div className="admin-backlog-editor-group-body">{s.items.map(renderItem)}</div>
    </div>
  ));
}

"use client";

import { useState } from "react";
import { PersonSelect } from "@/entities/crm/client";

// Live sample for the pattern library. Names are made up; real call sites feed
// PersonSelect from listAssignablePeople(), which is already ordered by first
// name and holds only people who are currently on the roster.
const SAMPLE = [
  { value: "1", label: "Ash Ly" },
  { value: "2", label: "Jordan Ellis" },
  { value: "3", label: "Đức Nguyễn" },
  { value: "4", label: "Ethan Trương" },
  { value: "5", label: "Ginny Võ" },
  { value: "6", label: "Harry Lê" },
  { value: "7", label: "Thảo Vy Đinh" },
  { value: "8", label: "Thành Nguyễn" },
];

export function PersonSelectDemo() {
  const [owner, setOwner] = useState("");
  const [grouped, setGrouped] = useState("");

  return (
    <div className="admin-form u-max-sm">
      <div className="admin-field">
        <label className="admin-label">Owner</label>
        <PersonSelect value={owner} onChange={setOwner} options={SAMPLE} emptyLabel="Unassigned" />
        <span className="admin-hint">
          Type to filter. Accent-insensitive, so &ldquo;duc&rdquo; finds Đức and &ldquo;truong&rdquo; finds Trương.
        </span>
      </div>
      <div className="admin-field">
        <label className="admin-label">With groups</label>
        <PersonSelect
          value={grouped}
          onChange={setGrouped}
          emptyLabel="Pick an owner…"
          options={[
            ...SAMPLE.slice(0, 3).map((o) => ({ ...o, group: "Team" })),
            { value: "a:revenue", label: "revenue agent", group: "Agents" },
            { value: "a:talent", label: "talent agent", group: "Agents" },
          ]}
        />
      </div>
      <div className="admin-field">
        <label className="admin-label">Compact (table cells)</label>
        <PersonSelect
          compact
          value={owner}
          onChange={setOwner}
          options={SAMPLE}
          emptyLabel="Unassigned"
          className="u-max-3"
        />
      </div>
    </div>
  );
}

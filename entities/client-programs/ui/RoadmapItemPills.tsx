"use client";

import { BACKLOG_PRIORITIES, PRIORITY_LABEL, type BacklogItem, type BacklogPriority } from "@/entities/client-programs/lib/client-backlog";

// The pill row on a roadmap item: Edge8's proposed priority, then Done.
// Done is the shipped status, not a priority, so it toggles on its own: a
// click marks the item shipped, a second click reopens it as accepted.
export function RoadmapItemPills({
  item,
  disabled,
  onPriority,
  onDone,
}: {
  item: BacklogItem;
  disabled: boolean;
  onPriority: (priority: BacklogPriority) => void;
  onDone: (done: boolean) => void;
}) {
  const shipped = item.status === "shipped";
  return (
    <span className="admin-backlog-editor-pills">
      {BACKLOG_PRIORITIES.map((p) => (
        <button
          key={p}
          type="button"
          className={`admin-backlog-editor-pill${item.edge8_priority === p ? ` on-${p}` : ""}`}
          disabled={disabled}
          onClick={() => onPriority(p)}
          title="Edge8 proposed priority"
        >
          {PRIORITY_LABEL[p]}
        </button>
      ))}
      <button
        type="button"
        className={`admin-backlog-editor-pill${shipped ? " on-done" : ""}`}
        disabled={disabled}
        onClick={() => onDone(!shipped)}
        title={shipped ? "Shipped. Click to reopen" : "Mark as done (shipped)"}
        aria-pressed={shipped}
      >
        {shipped ? "✓ Done" : "Done"}
      </button>
    </span>
  );
}

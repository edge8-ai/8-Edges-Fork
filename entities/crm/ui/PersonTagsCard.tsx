"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPersonTag, removePersonTag } from "@/entities/crm/lib/person-tags-actions";
import type { PersonTag } from "@/entities/crm/lib/person-tags";

// Tags on one contact: chips with a remove button, and a box to add one. The box
// suggests existing tags so the same marker is reused, not retyped.
export function PersonTagsCard({ personId, tags, options }: { personId: string; tags: PersonTag[]; options: PersonTag[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const listId = `person-tags-${personId}`;
  const attached = new Set(tags.map((t) => t.id));

  function run(action: () => ReturnType<typeof addPersonTag>, after?: () => void) {
    setError(null);
    start(async () => {
      const res = await action();
      if (!res.ok) return setError(res.error);
      after?.();
      router.refresh();
    });
  }

  return (
    <div className="u-stack u-gap-3">
      <h2 className="admin-card-title">Tags</h2>
      {tags.length === 0 ? (
        <div className="admin-cell-muted u-sm">No tags.</div>
      ) : (
        <div className="admin-chiplist">
          {tags.map((t) => (
            <span className="admin-chip" key={t.id}>
              {t.label}
              <button
                type="button"
                className="admin-auth-link"
                aria-label={`Remove tag ${t.label}`}
                disabled={pending}
                onClick={() => run(() => removePersonTag(personId, t.id))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <form
        className="u-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) run(() => addPersonTag(personId, draft), () => setDraft(""));
        }}
      >
        <input
          className="admin-input"
          list={listId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a tag"
          aria-label="Add a tag"
        />
        <datalist id={listId}>
          {options.filter((o) => !attached.has(o.id)).map((o) => (
            <option key={o.id} value={o.label} />
          ))}
        </datalist>
        <button type="submit" className="admin-btn" disabled={pending || !draft.trim()}>
          Add
        </button>
      </form>
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
    </div>
  );
}

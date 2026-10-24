"use client";

// Shared "who's in this photo" tagger, used by both the admin gallery manager
// and the team gallery browser. Presentation only: the parent passes the current
// tags, the list of taggable people, and the add/remove server actions (so the
// same UI drives admin-gated and team-gated writes). The picker renders in-flow
// (not an absolute dropdown) so it never gets clipped by a tile's overflow.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Result, TaggablePerson, TaggedPerson } from "@/entities/site/client";

const MAX_RESULTS = 8;

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- uploaded file of unknown size; next/image needs fixed dimensions
    return <img src={url} alt="" className="admin-avatar admin-avatar--xs" />;
  }
  return (
    <span className="admin-avatar admin-avatar--xs admin-avatar--muted" aria-hidden>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export function PhotoTagPicker({
  photoId,
  tags,
  taggable,
  onAdd,
  onRemove,
}: {
  photoId: string;
  tags: TaggedPerson[];
  taggable: TaggablePerson[];
  onAdd: (photoId: string, personId: string) => Promise<Result>;
  onRemove: (photoId: string, personId: string) => Promise<Result>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const taggedIds = useMemo(() => new Set(tags.map((t) => t.person_id)), [tags]);
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return taggable
      .filter((p) => !taggedIds.has(p.person_id))
      .filter((p) => (needle ? p.name.toLowerCase().includes(needle) : true))
      .slice(0, MAX_RESULTS);
  }, [taggable, taggedIds, q]);

  function run(action: () => Promise<Result>, onOk?: () => void) {
    setErr(null);
    start(async () => {
      const res = await action();
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      onOk?.();
      router.refresh();
    });
  }

  return (
    <div className="admin-phototag">
      <div className="admin-phototag-chips">
        {tags.map((t) => (
          <span key={t.person_id} className="admin-phototag-chip">
            <Avatar name={t.name} url={t.avatar_url} />
            <span className="admin-phototag-name">{t.name}</span>
            <button
              type="button"
              className="admin-phototag-x"
              aria-label={`Remove ${t.name}`}
              onClick={() => run(() => onRemove(photoId, t.person_id))}
              disabled={pending}
            >
              ×
            </button>
          </span>
        ))}
        <button
          type="button"
          className="admin-phototag-add"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          disabled={pending}
        >
          {tags.length ? "＋ Tag" : "＋ Tag people"}
        </button>
      </div>

      {open && (
        <div className="admin-phototag-picker">
          <input
            className="admin-input admin-phototag-search"
            placeholder="Search people…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
            disabled={pending}
          />
          <div className="admin-phototag-results">
            {matches.length === 0 ? (
              <div className="admin-phototag-none">{taggable.length ? "No matches" : "No people to tag"}</div>
            ) : (
              matches.map((p) => (
                <button
                  type="button"
                  key={p.person_id}
                  className="admin-phototag-result"
                  onClick={() => run(() => onAdd(photoId, p.person_id), () => setQ(""))}
                  disabled={pending}
                >
                  <Avatar name={p.name} url={p.avatar_url} />
                  <span>{p.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {err && <div className="admin-phototag-err">{err}</div>}
    </div>
  );
}

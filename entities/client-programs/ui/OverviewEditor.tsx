"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BotText } from "@/kernel/ui/BotText";
import type { SaveRoadmapOverview } from "./roadmap-actions-contract";

// Admin editor for the client-facing roadmap overview. Edit raw markdown
// (BotText syntax: **bold**, - bullets, links); the client sees it rendered at
// the top of their roadmap. Collapsed to a preview until you hit Edit.
export function OverviewEditor({ companyId, initialBody, save: saveRoadmapOverview }: { companyId: string; initialBody: string; save: SaveRoadmapOverview }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(initialBody);
  const [err, setErr] = useState<string | null>(null);

  function save() {
    setErr(null);
    start(async () => {
      const r = await saveRoadmapOverview(companyId, body);
      if (!r.ok) setErr(r.error);
      else {
        setEditing(false);
        router.refresh();
      }
    });
  }

  return (
    <section className="admin-card admin-section-card u-mb-4">
      <div className="u-row u-gap-3 u-between u-mb-2">
        <h2 className="admin-card-title">Overview <span className="admin-card-title-note">· shown to the client at the top of their roadmap</span></h2>
        {!editing && (
          <button type="button" className="admin-btn" onClick={() => { setBody(initialBody); setEditing(true); }}>
            {initialBody.trim() ? "Edit" : "Add overview"}
          </button>
        )}
      </div>

      {editing ? (
        <>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={14}
            className="admin-textarea admin-textarea--grow u-w-full"
            placeholder="Client-facing overview. Markdown: **bold** lead-ins, blank line between paragraphs, - for bullets."
          />
          {err && <div className="admin-alert admin-alert--err u-mt-2">{err}</div>}
          <div className="u-row u-mt-3">
            <button type="button" className="admin-btn admin-btn--primary" disabled={pending} onClick={save}>
              {pending ? "Saving…" : "Save overview"}
            </button>
            <button type="button" className="admin-btn" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </>
      ) : initialBody.trim() ? (
        <div className="u-lg">
          <BotText text={initialBody} />
        </div>
      ) : (
        <p className="admin-page-sub u-m-0">
          No overview yet. Every roadmap should open with one: a short, client-facing summary of
          what this roadmap is and how the plan works.
        </p>
      )}
    </section>
  );
}

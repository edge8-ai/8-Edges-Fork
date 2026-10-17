"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/kernel/ui/Badge";
import { updateJobPosting } from "./actions";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

export type PostingData = {
  isPublic: boolean;
  slug: string;
  fullJd: string;
  excerpt: string;
  department: string;
  featured: boolean;
  questions: string[]; // up to 3
  reqIsOpen: boolean;
};

// Publishing controls for one job req: what /careers shows and asks. A role is
// live iff the req is open AND public — the toggle is the publish switch, no
// deploy needed.
export function JobPostingEditor({ reqId, posting }: { reqId: string; posting: PostingData }) {
  const router = useRouter();
  const [isPublic, setIsPublic] = useState(posting.isPublic);
  const [slug, setSlug] = useState(posting.slug);
  const [excerpt, setExcerpt] = useState(posting.excerpt);
  const [department, setDepartment] = useState(posting.department);
  const [featured, setFeatured] = useState(posting.featured);
  const [fullJd, setFullJd] = useState(posting.fullJd);
  const [questions, setQuestions] = useState<string[]>([
    posting.questions[0] ?? "",
    posting.questions[1] ?? "",
    posting.questions[2] ?? "",
  ]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const live = isPublic && posting.reqIsOpen;

  async function save() {
    setSaving(true);
    setMsg(null);
    const r = await updateJobPosting(reqId, {
      is_public: isPublic,
      slug,
      full_jd: fullJd || null,
      excerpt: excerpt || null,
      department: department || null,
      featured,
      questions,
    });
    setSaving(false);
    if (!r.ok) {
      setMsg({ ok: false, text: r.error });
      return;
    }
    setMsg({ ok: true, text: "Posting saved." });
    router.refresh();
  }

  return (
    <div className="u-mt-6">
      <div className="u-row u-gap-3 u-mb-3">
        <div className="u-lg u-strong">Public posting</div>
        {live ? <Badge tone="ok">Live on /careers</Badge> : <Badge tone="neutral">Not published</Badge>}
      </div>

      <div className="admin-card u-p-4">
        <form
          className="admin-form"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {msg && <div className={`admin-alert ${msg.ok ? "admin-alert--ok" : "admin-alert--err"}`}>{msg.text}</div>}

          <div className="u-row u-wrap">
            <label className="u-row u-pointer">
              <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
              <span>Published{!posting.reqIsOpen && isPublic ? " (req not open, so still hidden)" : ""}</span>
            </label>
            <label className="u-row u-pointer">
              <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
              <span>Featured</span>
            </label>
          </div>

          <div className="u-grid-2 u-gap-3">
            <div className="admin-field">
              <label className="admin-label">Slug (public URL)</label>
              <input className="admin-input" value={slug} onChange={(e) => setSlug(e.target.value)} />
              {live && slug && (
                <div className="admin-hint u-mt-1">
                  <a href={`${SITE_URL}/careers/${slug}/apply`} target="_blank" rel="noreferrer">
                    edge8.ai/careers/{slug}/apply ↗
                  </a>
                </div>
              )}
            </div>
            <div className="admin-field">
              <label className="admin-label">Department label</label>
              <input
                className="admin-input"
                placeholder="e.g. Engineering"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              />
            </div>
          </div>

          <div className="admin-field">
            <label className="admin-label">Excerpt (card teaser on /careers)</label>
            <textarea className="admin-input" rows={2} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
          </div>

          <div className="admin-field">
            <label className="admin-label">Job description (markdown, shown on /careers)</label>
            <textarea
              className="admin-input admin-mono"
              rows={14}
              value={fullJd}
              onChange={(e) => setFullJd(e.target.value)}
            />
          </div>

          <div className="admin-field">
            <label className="admin-label">Screening questions (up to 3, required on the apply form)</label>
            {questions.map((q, i) => (
              <input
                key={i}
                className="admin-input u-mb-2"
                placeholder={`Question ${i + 1}${i === 0 ? " — e.g. Why Edge8?" : " (optional)"}`}
                value={q}
                onChange={(e) => setQuestions((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))}
              />
            ))}
          </div>

          <div className="admin-form-actions">
            <button type="submit" className="admin-btn admin-btn--primary" disabled={saving}>
              {saving ? "Saving…" : "Save posting"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

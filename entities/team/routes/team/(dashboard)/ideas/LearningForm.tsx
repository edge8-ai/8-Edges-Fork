"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitLearning } from "./actions";
import { appendDictation, useDictation } from "./useDictation";

// "What have I learned?" — the light half of Ideas that Spark Solutions.
// Deliberately not a wizard: one card, three fields (title, what happened,
// the takeaway). Claude gives it a quick editorial polish for the team feed;
// no 5D framework, no product plan.

type FieldKey = "story" | "takeaway";

const FIELDS: { key: FieldKey; label: string; teach: string; placeholder: string; rows: number }[] = [
  {
    key: "story",
    label: "What happened?",
    teach: "The moment you learned it — what you tried, what surprised you, what broke or clicked. Two honest sentences beat a polished paragraph.",
    placeholder:
      "e.g. I asked Claude to draft the client recap before the call instead of after, then just corrected it live. The draft was 80% right and the recap went out an hour after the meeting instead of the next day…",
    rows: 6,
  },
  {
    key: "takeaway",
    label: "What's the takeaway?",
    teach: "The lesson a teammate could act on tomorrow. If they read only this line, what should they do differently?",
    placeholder: "e.g. Draft before the meeting, not after — correcting is faster than creating.",
    rows: 3,
  },
];

export function LearningForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [fields, setFields] = useState<Record<FieldKey, string>>({ story: "", takeaway: "" });
  const [sourceUrls, setSourceUrls] = useState<string[]>([""]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeField, setActiveField] = useState<FieldKey | null>(null);

  function setSourceUrl(i: number, value: string) {
    setSourceUrls((prev) => prev.map((u, idx) => (idx === i ? value : u)));
  }

  function removeSourceUrl(i: number) {
    setSourceUrls((prev) => (prev.length === 1 ? [""] : prev.filter((_, idx) => idx !== i)));
  }

  const { canDictate, listening, toggleDictation, stopDictation } = useDictation((field, heard) =>
    setFields((f) => ({ ...f, [field]: appendDictation(f[field as FieldKey], heard) })),
  );

  function dictate(key: FieldKey) {
    // Tapping a different field's mic while listening: stop, don't restart.
    setActiveField(listening ? null : key);
    toggleDictation(key);
  }

  async function submit() {
    setError(null);
    stopDictation();
    setSubmitting(true);
    const r = await submitLearning({ title, ...fields, sourceUrls });
    if (!r.ok) {
      setSubmitting(false);
      setError(r.error);
      return;
    }
    router.push(`/team/ideas/${r.id}`);
  }

  if (submitting) {
    return (
      <div className="admin-card admin-empty--tall u-center-text">
        <h2 className="admin-card-title">Sharing your learning…</h2>
        <p className="admin-page-sub u-mt-2">
          It&apos;s saved. Claude is giving it a quick polish for the team feed — this takes a few
          seconds.
        </p>
      </div>
    );
  }

  return (
    <div className="admin-card u-p-5">
      <h2 className="admin-card-title">Share what you learned</h2>
      <p className="admin-page-sub u-mt-0">
        Learn and Share is how we work: something you figured out this week is something the whole
        team gets to skip figuring out. Type or tap the mic and talk — it goes straight onto the
        team feed.
      </p>

      <div className="admin-form u-mt-4">
        <div className="admin-field">
          <label className="admin-label" htmlFor="learning-title">Title</label>
          <input
            id="learning-title"
            className="admin-input"
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Draft the recap before the meeting"
            autoFocus
          />
        </div>

        {FIELDS.map((f) => (
          <div key={f.key} className="admin-field">
            <div className="u-row u-wrap u-between">
              <label className="admin-label" htmlFor={`learning-${f.key}`}>{f.label}</label>
              {canDictate && (
                <button
                  type="button"
                  className={`admin-btn admin-btn--sm${listening && activeField === f.key ? " admin-btn--primary" : ""}`}
                  onClick={() => dictate(f.key)}
                  aria-pressed={listening && activeField === f.key}
                >
                  {listening && activeField === f.key ? "◉ Listening — tap to stop" : "🎙 Dictate"}
                </button>
              )}
            </div>
            <p className="admin-page-sub u-mt-0 u-mb-2">{f.teach}</p>
            <textarea
              id={`learning-${f.key}`}
              className="admin-textarea"
              rows={f.rows}
              value={fields[f.key]}
              maxLength={5000}
              onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
              placeholder={f.placeholder}
            />
          </div>
        ))}

        <div className="admin-field">
          <label className="admin-label">Where did this come from?</label>
          <p className="admin-page-sub u-mt-0 u-mb-2">
            Optional — link the article, doc, or thread this learning came from, so a teammate can
            go straight to the source.
          </p>
          <div className="u-stack">
            {sourceUrls.map((url, i) => (
              <div key={i} className="u-row">
                <input
                  className="admin-input"
                  type="url"
                  value={url}
                  maxLength={500}
                  onChange={(e) => setSourceUrl(i, e.target.value)}
                  placeholder="https://…"
                />
                {(sourceUrls.length > 1 || url) && (
                  <button
                    type="button"
                    className="admin-btn admin-btn--sm"
                    onClick={() => removeSourceUrl(i)}
                    aria-label="Remove this link"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            className="admin-btn admin-btn--sm u-mt-2 u-self-start"
            onClick={() => setSourceUrls((prev) => [...prev, ""])}
          >
            + Add another link
          </button>
        </div>

        {error && <div className="admin-alert admin-alert--err">{error}</div>}

        <div className="admin-form-actions">
          <button type="button" className="admin-btn admin-btn--primary" onClick={submit}>
            Share with the team
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { setMyHowIWork } from "@/entities/coaching/lib/my-actions";
import { HOW_FIELD_MAX, HOW_I_WORK, type HowIWork as HowIWorkFacts } from "@/entities/coaching/lib/how-i-work";

// "How I work" — the member's own half of the profile (L.3).
//
// It sits beside the OCEAN card, and the pair is the point. The page has always
// published how the coach reads this person, invited them to "bring anything
// you see differently", and given them nowhere to bring it except the meeting.
// This is the other half, and it is the member who writes it.
//
// Two things carry that:
//
// - each card's EYEBROW names its author. "Written by me" and "written by my
//   coach" turn a verdict into a conversation, and cost one line each.
// - the member's half takes the growth rail. On their own page, their voice
//   leads; the coach's read is context beside it, not a header above it.
//
// Every field saves on blur, alone. There is no Save button because there is
// nothing to submit — a personal manual is four independent sentences, and a
// form that makes you finish all four to record one is a form you abandon.

export function HowIWork({ facts, coachName }: { facts: HowIWorkFacts; coachName: string | null }) {
  const [draft, setDraft] = useState<HowIWorkFacts>(facts);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const commit = (key: (typeof HOW_I_WORK)[number]["key"], label: string) => {
    if ((facts[key] ?? "") === (draft[key] ?? "")) return;
    setError(null);
    startTransition(async () => {
      const res = await setMyHowIWork(key, draft[key] ?? "");
      if (!res.ok) {
        setError(`${label}: ${res.error}`);
        return;
      }
      setSaved(label);
    });
  };

  return (
    <section className="admin-card admin-coach-section coach-how">
      <div className="admin-eyebrow admin-eyebrow--growth">Written by me</div>
      <div className="admin-card-title">How I work</div>
      <div className="admin-hint">
        {coachName ? `${coachName} reads this` : "Your coach reads this"}, and your 1-1 prep uses it. Change it
        whenever it stops being true.
      </div>

      <div className="coach-how-fields">
        {HOW_I_WORK.map((p) => (
          <div key={p.key} className="admin-field">
            <label className="admin-label" htmlFor={`how-${p.key}`}>
              {p.label}
            </label>
            <textarea
              id={`how-${p.key}`}
              className="admin-input"
              rows={2}
              maxLength={HOW_FIELD_MAX}
              disabled={busy}
              placeholder={p.placeholder}
              value={draft[p.key] ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, [p.key]: e.target.value }))}
              onBlur={() => commit(p.key, p.label)}
            />
          </div>
        ))}
      </div>

      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      {!error && saved && <div className="admin-hint">Saved {saved.toLowerCase()}.</div>}
    </section>
  );
}

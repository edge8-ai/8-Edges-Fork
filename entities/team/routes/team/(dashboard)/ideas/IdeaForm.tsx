"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitIdea } from "./actions";
import { PlanGenerating } from "./PlanGenerating";
import { appendDictation, useDictation } from "./useDictation";

// Guided 5D submission form. One step per D (Define, Discover, Design,
// Determine — Deploy is deliberately skipped: submitters won't know deployment
// details yet, and that's fine at the backlog stage). Each step teaches its D
// with A01 language and offers voice dictation (see useDictation).

type FieldKey = "problem" | "data_needed" | "workflow" | "roi";

type Step = {
  key: FieldKey;
  d: string;
  title: string;
  teach: string;
  placeholder: string;
};

const STEPS: Step[] = [
  {
    key: "problem",
    d: "Define",
    title: "Define the problem",
    teach:
      "The most important D — and the one most people skip. Who specifically feels this pain, and how often? What does it cost in time, money, or missed value (give a number, even a rough one)? Why is now the right time? If you can't describe the problem without naming a tool, it isn't defined yet.",
    placeholder:
      "e.g. Our recruiters spend ~3 hours per role manually summarizing applicants. With 10 open roles a month that's 30 hours of copy-paste work, and good candidates wait days for a reply…",
  },
  {
    key: "data_needed",
    d: "Discover",
    title: "Discover the data it needs",
    teach:
      "What information would AI need to do this job well — and where does it live right now? Documents, spreadsheets, systems, someone's head? This is where most AI programs hit their first real obstacle, so naming the gaps now is worth everything it costs.",
    placeholder:
      "e.g. Resumes (in Supabase storage), the job description (in the ATS), our screening criteria (currently in Hoa's head, not written down anywhere)…",
  },
  {
    key: "workflow",
    d: "Design",
    title: "Design the workflow",
    teach:
      "Sketch the job end to end: what triggers it, the steps in order, and what output lands where. Mark where AI does the work and where a person stays in the loop. High level is fine — someone else should be able to read it and follow the shape.",
    placeholder:
      "e.g. New application arrives → AI reads resume + JD → drafts a summary and fit score → recruiter reviews the top 5 → shortlist email goes out same day…",
  },
  {
    key: "roi",
    d: "Determine",
    title: "Determine the ROI",
    teach:
      "Set the measure before the build. AI ROI comes through four channels: time saved, cost reduced, quality improved, speed increased. Name the number that would tell you this worked — a 20% improvement gets ignored, a 70% improvement gets noticed.",
    placeholder:
      "e.g. Screening time drops from 3 hours to 20 minutes per role — roughly 26 hours a month back, and every candidate gets a response within 24 hours…",
  },
];

// Given a spark (the person's own one-line idea, ID.2.1), the form starts from
// its line and any story already added, and submitting fills that spark in.
export function IdeaForm({ spark }: { spark?: { id: string; title: string; problem: string } }) {
  const router = useRouter();
  const [step, setStep] = useState(0); // 0 = title intro, 1..4 = the Ds
  const [title, setTitle] = useState(spark?.title ?? "");
  const [fields, setFields] = useState<Record<FieldKey, string>>({
    problem: spark?.problem ?? "",
    data_needed: "",
    workflow: "",
    roi: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { canDictate, listening, toggleDictation, stopDictation } = useDictation((field, heard) =>
    setFields((f) => ({ ...f, [field]: appendDictation(f[field as FieldKey], heard) })),
  );

  const current = step >= 1 ? STEPS[step - 1] : null;

  function next() {
    setError(null);
    stopDictation();
    if (step === 0 && !title.trim()) {
      setError("Give your idea a short title first.");
      return;
    }
    if (current && !fields[current.key].trim()) {
      setError(`Fill in "${current.title}" before moving on — even two sentences is enough.`);
      return;
    }
    setStep((s) => s + 1);
  }

  function back() {
    setError(null);
    stopDictation();
    setStep((s) => Math.max(0, s - 1));
  }

  async function submit() {
    setError(null);
    stopDictation();
    if (!fields.roi.trim()) {
      setError("Estimate the ROI — a rough number beats no number.");
      return;
    }
    setSubmitting(true);
    const r = await submitIdea({ title, ...fields }, spark?.id);
    if (!r.ok) {
      setSubmitting(false);
      setError(r.error);
      return;
    }
    router.push(`/team/ideas/${r.id}`);
  }

  if (submitting) {
    return <PlanGenerating />;
  }

  return (
    <div className="admin-card u-p-5">
      {step === 0 ? (
        <>
          <h2 className="admin-card-title">Start with a name</h2>
          <p className="admin-page-sub u-mt-0">
            You&apos;ll walk through the first four Ds of the 5D framework — Define, Discover, Design,
            Determine. (Deploy comes later, once an idea is picked up.) Type your answers or tap the
            mic and talk. Two honest sentences per step beat a polished paragraph.
          </p>
          <div className="admin-field u-mt-4">
            <label className="admin-label" htmlFor="idea-title">Idea title</label>
            <input
              id="idea-title"
              className="admin-input"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. AI applicant screening for open roles"
              autoFocus
            />
          </div>
        </>
      ) : current ? (
        <>
          <div className="u-row u-gap-3 u-mb-1">
            <span className="admin-badge admin-badge--info">Step {step} of 4 · {current.d}</span>
          </div>
          <h2 className="admin-card-title u-mb-2">{current.title}</h2>
          <p className="admin-page-sub u-mt-0">{current.teach}</p>
          <div className="admin-field">
            <div className="u-row u-wrap u-between">
              <label className="admin-label" htmlFor={`idea-${current.key}`}>Your answer</label>
              {canDictate && (
                <button
                  type="button"
                  className={`admin-btn admin-btn--sm${listening ? " admin-btn--primary" : ""}`}
                  onClick={() => toggleDictation(current.key)}
                  aria-pressed={listening}
                >
                  {listening ? "◉ Listening — tap to stop" : "🎙 Dictate"}
                </button>
              )}
            </div>
            <textarea
              id={`idea-${current.key}`}
              className="admin-textarea"
              rows={7}
              value={fields[current.key]}
              maxLength={5000}
              onChange={(e) => setFields((f) => ({ ...f, [current.key]: e.target.value }))}
              placeholder={current.placeholder}
              autoFocus
            />
          </div>
        </>
      ) : null}

      {error && <div className="admin-alert admin-alert--err u-mt-3">{error}</div>}

      <div className="admin-form-actions u-mt-4">
        {step > 0 && (
          <button type="button" className="admin-btn" onClick={back}>
            Back
          </button>
        )}
        {step < 4 ? (
          <button type="button" className="admin-btn admin-btn--primary" onClick={next}>
            {step === 0 ? "Start with Define" : `Next: ${STEPS[step]?.d ?? "Review"}`}
          </button>
        ) : (
          <button type="button" className="admin-btn admin-btn--primary" onClick={submit}>
            Submit idea → get my product plan
          </button>
        )}
      </div>
    </div>
  );
}

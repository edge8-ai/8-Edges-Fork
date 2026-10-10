"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Tabs } from "@/kernel/ui/Tabs";
import { createCandidate, createCandidateWithFile, extractResumeDraft, type CreateCandidateResult } from "./actions";
import { personName } from "@/kernel/config/people-name";

export type JobReqOption = { id: string; title: string; location: string | null };

const MAX_BATCH = 25;
// Extractions run a few at a time: each is its own Claude call, and firing a
// whole 25-file batch at once risks API rate limits with no user benefit.
const EXTRACT_CONCURRENCY = 4;
const RESUME_ACCEPT =
  ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// The candidate fields both tabs edit. Everything is a plain string here;
// the actions trim and null empty values.
type FieldValues = {
  fullName: string;
  email: string;
  phone: string;
  linkedinUrl: string;
  headline: string;
  currentTitle: string;
  portfolioUrl: string;
};

const EMPTY_FIELDS: FieldValues = {
  fullName: "",
  email: "",
  phone: "",
  linkedinUrl: "",
  headline: "",
  currentTitle: "",
  portfolioUrl: "",
};

export function AddCandidates({ jobReqs, initialReqId = "" }: { jobReqs: JobReqOption[]; initialReqId?: string }) {
  return (
    <Tabs
      tabs={[
        { key: "resumes", label: "From resumes", content: <ResumeIntake jobReqs={jobReqs} initialReqId={initialReqId} /> },
        { key: "manual", label: "Manual entry", content: <ManualEntry jobReqs={jobReqs} initialReqId={initialReqId} /> },
      ]}
    />
  );
}

function JobReqSelect({
  jobReqs,
  value,
  onChange,
  disabled,
}: {
  jobReqs: JobReqOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <select
      className="admin-select"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Pick a position…</option>
      {jobReqs.map((r) => (
        <option key={r.id} value={r.id}>
          {r.title}
          {r.location ? ` — ${r.location}` : ""}
        </option>
      ))}
    </select>
  );
}

function CandidateFields({
  value,
  onChange,
  disabled,
}: {
  value: FieldValues;
  onChange: (v: FieldValues) => void;
  disabled?: boolean;
}) {
  const set = (k: keyof FieldValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [k]: e.target.value });
  return (
    <>
      <div className="u-grid-2 u-gap-3">
        <div className="admin-field">
          <label className="admin-label">Full name *</label>
          <input className="admin-input" value={value.fullName} disabled={disabled} onChange={set("fullName")} />
        </div>
        <div className="admin-field">
          <label className="admin-label">Email *</label>
          <input
            className="admin-input"
            type="email"
            value={value.email}
            disabled={disabled}
            onChange={set("email")}
          />
        </div>
      </div>
      <div className="u-grid-2 u-gap-3">
        <div className="admin-field">
          <label className="admin-label">Phone</label>
          <input className="admin-input" type="tel" value={value.phone} disabled={disabled} onChange={set("phone")} />
        </div>
        <div className="admin-field">
          <label className="admin-label">LinkedIn</label>
          <input
            className="admin-input"
            type="url"
            placeholder="https://linkedin.com/in/…"
            value={value.linkedinUrl}
            disabled={disabled}
            onChange={set("linkedinUrl")}
          />
        </div>
      </div>
      <div className="u-grid-2 u-gap-3">
        <div className="admin-field">
          <label className="admin-label">Current title</label>
          <input
            className="admin-input"
            value={value.currentTitle}
            disabled={disabled}
            onChange={set("currentTitle")}
          />
        </div>
        <div className="admin-field">
          <label className="admin-label">Portfolio</label>
          <input
            className="admin-input"
            type="url"
            placeholder="https://…"
            value={value.portfolioUrl}
            disabled={disabled}
            onChange={set("portfolioUrl")}
          />
        </div>
      </div>
      <div className="admin-field">
        <label className="admin-label">Headline</label>
        <input className="admin-input" value={value.headline} disabled={disabled} onChange={set("headline")} />
      </div>
    </>
  );
}

// ─── Tab 1: batch resume intake ──────────────────────────────────────────────
// Each dropped file becomes a draft card: the file is stored and Claude
// prefills the fields, then the recruiter reviews/edits and saves each one.
// Nothing reaches the pipeline until a card is saved.

type Draft = {
  key: string;
  fileName: string;
  state: "extracting" | "ready" | "saving" | "saved" | "failed";
  fields: FieldValues;
  upload: { storagePath: string; mimeType: string | null; byteSize: number; fileName: string } | null;
  error: string | null; // upload/save errors (card is stuck until resolved)
  extractError: string | null; // extraction-only failure — fields stay editable
  applicationId: string | null;
  existingApplicationId: string | null; // set when the save hit the duplicate guard
};

let draftSeq = 0;

function ResumeIntake({ jobReqs, initialReqId }: { jobReqs: JobReqOption[]; initialReqId: string }) {
  const [reqId, setReqId] = useState(initialReqId);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const patch = (key: string, p: Partial<Draft>) =>
    setDrafts((cur) => cur.map((d) => (d.key === key ? { ...d, ...p } : d)));

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_BATCH);
    if (inputRef.current) inputRef.current.value = "";
    if (files.length === 0) return;

    const fresh: Draft[] = files.map((f) => ({
      key: `d${draftSeq++}`,
      fileName: f.name,
      state: "extracting",
      fields: EMPTY_FIELDS,
      upload: null,
      error: null,
      extractError: null,
      applicationId: null,
      existingApplicationId: null,
    }));
    setDrafts((cur) => [...cur, ...fresh]);

    const extractOne = async (file: File, key: string) => {
      const fd = new FormData();
      fd.append("resume", file);
      try {
        const r = await extractResumeDraft(fd);
        if (!r.ok) return patch(key, { state: "failed", error: r.error });
        patch(key, {
          state: "ready",
          upload: r.upload,
          extractError: r.extractError,
          fields: {
            fullName: r.fields?.full_name ?? "",
            email: r.fields?.email ?? "",
            phone: r.fields?.phone ?? "",
            linkedinUrl: r.fields?.linkedin_url ?? "",
            headline: r.fields?.headline ?? "",
            currentTitle: r.fields?.current_title ?? "",
            portfolioUrl: r.fields?.portfolio_url ?? "",
          },
        });
      } catch {
        patch(key, { state: "failed", error: "Something went wrong reading this file." });
      }
    };

    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(EXTRACT_CONCURRENCY, files.length) }, async () => {
        while (next < files.length) {
          const i = next++;
          await extractOne(files[i], fresh[i].key);
        }
      }),
    );
  }

  async function saveDraft(d: Draft): Promise<CreateCandidateResult> {
    patch(d.key, { state: "saving", error: null, existingApplicationId: null });
    const r = await createCandidate({
      jobRequisitionId: reqId,
      fullName: d.fields.fullName,
      email: d.fields.email,
      phone: d.fields.phone,
      linkedinUrl: d.fields.linkedinUrl,
      portfolioUrl: d.fields.portfolioUrl,
      headline: d.fields.headline,
      currentTitle: d.fields.currentTitle,
      resume: d.upload,
    });
    if (r.ok) patch(d.key, { state: "saved", applicationId: r.applicationId });
    else patch(d.key, { state: "ready", error: r.error, existingApplicationId: r.existingApplicationId ?? null });
    return r;
  }

  // Sequential on purpose: parallel saves of the same person (duplicate resumes
  // in one batch) would race the get-or-create.
  async function saveAll() {
    for (const d of drafts) {
      if (d.state === "ready") await saveDraft(d);
    }
  }

  const readyCount = drafts.filter((d) => d.state === "ready").length;
  const extracting = drafts.some((d) => d.state === "extracting");

  return (
    <div className="u-max-narrow">
      <div className="admin-card admin-section-card u-mb-4">
        <div className="admin-form">
          <div className="admin-form-row">
            <div className="admin-field">
              <label className="admin-label">Position *</label>
              <JobReqSelect jobReqs={jobReqs} value={reqId} onChange={setReqId} />
            </div>
            <div className="admin-field">
              <button type="button" className="admin-btn admin-btn--primary" onClick={() => inputRef.current?.click()}>
                Add resumes…
              </button>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept={RESUME_ACCEPT}
                className="u-hidden-input"
                onChange={onFiles}
              />
            </div>
          </div>
          <div className="admin-hint">
            PDF or .docx (resumes, not job descriptions), up to {MAX_BATCH} at a time, max 10 MB each. Each resume is
            read by AI to prefill a draft — review and save each candidate below.
          </div>
        </div>
      </div>

      {drafts.length > 0 && (
        <div className="admin-card-head">
          <div className="admin-cell-muted">
            {drafts.length} {drafts.length === 1 ? "resume" : "resumes"}
            {extracting ? " · reading…" : ""}
          </div>
          {readyCount > 1 && (
            <button
              type="button"
              className="admin-btn admin-btn--primary admin-btn--sm"
              disabled={!reqId}
              onClick={saveAll}
              title={reqId ? undefined : "Pick a position first"}
            >
              Save all ({readyCount})
            </button>
          )}
        </div>
      )}

      {drafts.map((d) => (
        <div key={d.key} className="admin-card admin-section-card u-mb-3">
          <div className="u-row u-between u-mb-3">
            <span className="admin-cell-strong">{d.fileName}</span>
            <span className="admin-cell-muted">
              {d.state === "extracting" && "Reading resume…"}
              {d.state === "saving" && "Saving…"}
              {d.state === "saved" && "Saved ✓"}
            </span>
          </div>

          {d.state === "extracting" ? (
            <div className="admin-hint">Extracting candidate details…</div>
          ) : d.state === "failed" ? (
            <div className="admin-alert admin-alert--err">{d.error}</div>
          ) : d.state === "saved" ? (
            <div>
              {personName({ full_name: d.fields.fullName, email: d.fields.email })} added to the pipeline.{" "}
              <Link href="/admin/talent/applications" className="admin-cell-strong">
                Open applications
              </Link>
            </div>
          ) : (
            <div className="admin-form">
              {d.extractError && (
                <div className="admin-alert admin-alert--err">
                  AI couldn’t read this file ({d.extractError}) — fill the fields by hand; the resume is still attached.
                </div>
              )}
              <CandidateFields
                value={d.fields}
                onChange={(fields) => patch(d.key, { fields })}
                disabled={d.state === "saving"}
              />
              {d.error && (
                <div className="admin-alert admin-alert--err">
                  {d.error}
                  {d.existingApplicationId && (
                    <>
                      {" "}
                      <Link href="/admin/talent/applications" className="admin-cell-strong">
                        Open applications
                      </Link>
                    </>
                  )}
                </div>
              )}
              <div className="admin-form-actions">
                <button
                  type="button"
                  className="admin-btn admin-btn--primary admin-btn--sm"
                  disabled={d.state === "saving" || !reqId}
                  title={reqId ? undefined : "Pick a position first"}
                  onClick={() => saveDraft(d)}
                >
                  {d.state === "saving" ? "Saving…" : "Save candidate"}
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn--sm"
                  disabled={d.state === "saving"}
                  onClick={() => setDrafts((cur) => cur.filter((x) => x.key !== d.key))}
                >
                  Discard
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Tab 2: manual entry ─────────────────────────────────────────────────────

function ManualEntry({ jobReqs, initialReqId }: { jobReqs: JobReqOption[]; initialReqId: string }) {
  const [reqId, setReqId] = useState(initialReqId);
  const [fields, setFields] = useState<FieldValues>(EMPTY_FIELDS);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [savedName, setSavedName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit() {
    setError(null);
    setIsDuplicate(false);
    setSavedName(null);
    if (!file) return setError("Upload the candidate's resume.");
    setSaving(true);
    const fd = new FormData();
    fd.append("resume", file);
    const r = await createCandidateWithFile(
      {
        jobRequisitionId: reqId,
        fullName: fields.fullName,
        email: fields.email,
        phone: fields.phone,
        linkedinUrl: fields.linkedinUrl,
        portfolioUrl: fields.portfolioUrl,
        headline: fields.headline,
        currentTitle: fields.currentTitle,
      },
      fd,
    );
    setSaving(false);
    if (!r.ok) {
      setIsDuplicate(Boolean(r.existingApplicationId));
      return setError(r.error);
    }
    setSavedName(personName({ full_name: fields.fullName, email: fields.email }));
    setFields(EMPTY_FIELDS);
    setReqId("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="admin-card admin-section-card u-max-7">
      <div className="admin-form">
        <div className="admin-field">
          <label className="admin-label">Position *</label>
          <JobReqSelect jobReqs={jobReqs} value={reqId} onChange={setReqId} disabled={saving} />
        </div>

        <CandidateFields value={fields} onChange={setFields} disabled={saving} />

        <div className="admin-field">
          <label className="admin-label">Resume *</label>
          <input
            ref={fileRef}
            type="file"
            accept={RESUME_ACCEPT}
            disabled={saving}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <div className="admin-hint">PDF or .docx, max 10 MB. The AI fit screen runs automatically after saving.</div>
        </div>

        {error && (
          <div className="admin-alert admin-alert--err">
            {error}
            {isDuplicate && (
              <>
                {" "}
                <Link href="/admin/talent/applications" className="admin-cell-strong">
                  Open applications
                </Link>
              </>
            )}
          </div>
        )}
        {savedName && (
          <div className="admin-alert admin-alert--ok">
            {savedName} added to the pipeline.{" "}
            <Link href="/admin/talent/applications" className="admin-cell-strong">
              Open applications
            </Link>
          </div>
        )}

        <div className="admin-form-actions">
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            disabled={saving || !reqId || !fields.fullName.trim() || !fields.email.trim()}
            onClick={submit}
          >
            {saving ? "Saving…" : "Add candidate"}
          </button>
        </div>
      </div>
    </div>
  );
}

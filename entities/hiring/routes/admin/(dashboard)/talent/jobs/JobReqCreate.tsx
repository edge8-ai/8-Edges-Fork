"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { createJobReq } from "./actions";
import { JobPeopleFields, type JobFieldOptions, type JobPeople } from "./JobPeopleFields";
import type { MayProp } from "@/kernel/identity/may-prop";
import {
  EMPLOYMENT_TYPE_OPTIONS as EMPLOYMENT_OPTIONS,
  SALARY_CURRENCIES,
  WORKPLACE_OPTIONS,
} from "@/entities/hiring/lib/recruiting-options";

const NONE: JobPeople = { clientId: "", managerId: "", recruiterId: "" };

// The New job button and its drawer: the same fields as the jobs drawer, so a
// staffing job starts with its client, their hiring manager and our recruiter.
// On success it lands on the job's own page, where the careers ad is written.
export function JobReqCreate({ options, may }: { options: JobFieldOptions; may: MayProp }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [employmentType, setEmploymentType] = useState("full_time");
  const [remotePolicy, setRemotePolicy] = useState("");
  const [location, setLocation] = useState("");
  const [seats, setSeats] = useState("1");
  const [people, setPeople] = useState<JobPeople>(NONE);
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [currency, setCurrency] = useState("usd");
  const [description, setDescription] = useState("");
  const client = options.companies.find((c) => c.id === people.clientId) ?? null;

  async function submit() {
    setBusy(true);
    setError(null);
    const r = await createJobReq({
      title,
      employment_type: employmentType,
      location: location || null,
      remote_policy: remotePolicy || null,
      headcount: Number(seats),
      client_company_id: people.clientId || null,
      hiring_manager_id: people.managerId || null,
      recruiter_id: people.recruiterId || null,
      salary_min: salaryMin.trim() === "" ? null : Number(salaryMin),
      salary_max: salaryMax.trim() === "" ? null : Number(salaryMax),
      currency,
      description: description || null,
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setOpen(false);
    router.push(`/admin/talent/jobs/${r.id}`);
  }

  // createJobReq asks for hiring.ats, so without it there is no New job button.
  if (!may["hiring.ats"]) return null;
  return (
    <>
      <button type="button" className="admin-btn admin-btn--primary" onClick={() => setOpen(true)}>
        New job
      </button>

      <DetailDrawer open={open} onClose={() => setOpen(false)} eyebrow="Job" title="New job">
        <div className="admin-form">
          <p className="admin-section-label">The job</p>
          <div className="admin-field">
            <label className="admin-label" htmlFor={`${id}-title`}>Job title *</label>
            <input id={`${id}-title`} className="admin-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. AI Engineer" autoFocus />
          </div>
          <div className="u-grid-auto-sm">
            <div className="admin-field">
              <label className="admin-label" htmlFor={`${id}-type`}>Employment type</label>
              <select id={`${id}-type`} className="admin-select" value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}>
                {EMPLOYMENT_OPTIONS.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="admin-field">
              <label className="admin-label" htmlFor={`${id}-workplace`}>Workplace</label>
              <select id={`${id}-workplace`} className="admin-select" value={remotePolicy} onChange={(e) => setRemotePolicy(e.target.value)}>
                {WORKPLACE_OPTIONS.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="u-grid-auto-sm">
            <div className="admin-field">
              <label className="admin-label" htmlFor={`${id}-location`}>Location</label>
              <input id={`${id}-location`} className="admin-input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Ho Chi Minh City" />
            </div>
            <div className="admin-field">
              <label className="admin-label" htmlFor={`${id}-seats`}>Seats to fill</label>
              <input id={`${id}-seats`} className="admin-input" type="number" min="1" step="1" inputMode="numeric" value={seats} onChange={(e) => setSeats(e.target.value)} />
            </div>
          </div>

          <JobPeopleFields
            value={people}
            // A new client clears the hiring manager here as in the drawer.
            onChange={(patch) => setPeople((p) => ({ ...p, ...patch }))}
            options={options}
            may={may}
          />

          <p className="admin-section-label u-mt-4">Pay</p>
          <div className="u-grid-2-fixed">
            <div className="admin-field">
              <label className="admin-label" htmlFor={`${id}-min`}>Salary from</label>
              <input id={`${id}-min`} className="admin-input" type="number" min="0" step="0.01" inputMode="decimal" value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} />
            </div>
            <div className="admin-field">
              <label className="admin-label" htmlFor={`${id}-max`}>Salary to</label>
              <input id={`${id}-max`} className="admin-input" type="number" min="0" step="0.01" inputMode="decimal" value={salaryMax} onChange={(e) => setSalaryMax(e.target.value)} />
            </div>
            <div className="admin-field">
              <label className="admin-label" htmlFor={`${id}-currency`}>Currency</label>
              <select id={`${id}-currency`} className="admin-select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {SALARY_CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c.toUpperCase()}</option>
                ))}
              </select>
            </div>
          </div>
          {client && (
            <div className="admin-hint">Put the maximum {client.name} gave you in Salary to, and leave Salary from empty: it shows as &quot;Up to&quot;.</div>
          )}

          <p className="admin-section-label u-mt-4">Notes for the team</p>
          <div className="admin-field">
            <label className="admin-label" htmlFor={`${id}-notes`}>Notes</label>
            <textarea id={`${id}-notes`} className="admin-input" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
            <div className="admin-hint">For the team. You write the careers ad on the next screen; a published job with no ad text of its own shows these notes as its ad.</div>
          </div>

          {error && <div className="admin-alert admin-alert--err">{error}</div>}

          <div className="u-row">
            <button type="button" className="admin-btn admin-btn--primary" disabled={busy || !title.trim()} onClick={submit}>
              {busy ? "Creating…" : "Create job"}
            </button>
            <button type="button" className="admin-btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
          <div className="admin-hint">It stays off the careers page until you publish its ad from the hiring board.</div>
        </div>
      </DetailDrawer>
    </>
  );
}

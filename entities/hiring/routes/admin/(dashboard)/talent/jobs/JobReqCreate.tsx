"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { createJobReq } from "./actions";

const EMPLOYMENT_OPTIONS = [
  ["full_time", "Full-time"],
  ["part_time", "Part-time"],
  ["contract", "Contract"],
  ["intern", "Internship"],
  ["temp", "Temporary"],
  ["advisor", "Advisor"],
] as const;

const REMOTE_OPTIONS = [
  ["", "Not set"],
  ["onsite", "Onsite"],
  ["hybrid", "Hybrid"],
  ["remote", "Remote"],
] as const;

const CURRENCIES = ["usd", "eur", "gbp", "aud", "sgd", "vnd"];

// "New req" button + drawer form. On success we land on the req's full page
// (hiring board + posting editor) so the recruiter can paste the JD and
// publish to /careers from there.
export function JobReqCreate() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [employmentType, setEmploymentType] = useState("full_time");
  const [remotePolicy, setRemotePolicy] = useState("");
  const [location, setLocation] = useState("");
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [currency, setCurrency] = useState("usd");
  const [description, setDescription] = useState("");

  async function submit() {
    setBusy(true);
    setError(null);
    const r = await createJobReq({
      title,
      employment_type: employmentType,
      location: location || null,
      remote_policy: remotePolicy || null,
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

  return (
    <>
      <button type="button" className="admin-btn admin-btn--primary" onClick={() => setOpen(true)}>
        New req
      </button>

      <DetailDrawer open={open} onClose={() => setOpen(false)} eyebrow="Job req" title="New job req">
        <div className="admin-form">
          <div className="admin-field">
            <label className="admin-label">Title *</label>
            <input
              className="admin-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. AI Engineer"
              autoFocus
            />
          </div>
          <div className="u-grid-auto-sm">
            <div className="admin-field">
              <label className="admin-label">Type</label>
              <select className="admin-select" value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}>
                {EMPLOYMENT_OPTIONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="admin-field">
              <label className="admin-label">Remote policy</label>
              <select className="admin-select" value={remotePolicy} onChange={(e) => setRemotePolicy(e.target.value)}>
                {REMOTE_OPTIONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="admin-field">
            <label className="admin-label">Location</label>
            <input
              className="admin-input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Ho Chi Minh City, Vietnam"
            />
          </div>
          <div className="u-grid-2-fixed">
            <div className="admin-field">
              <label className="admin-label">Salary min</label>
              <input
                className="admin-input"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={salaryMin}
                onChange={(e) => setSalaryMin(e.target.value)}
              />
            </div>
            <div className="admin-field">
              <label className="admin-label">Salary max</label>
              <input
                className="admin-input"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={salaryMax}
                onChange={(e) => setSalaryMax(e.target.value)}
              />
            </div>
            <div className="admin-field">
              <label className="admin-label">Currency</label>
              <select className="admin-select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="admin-field">
            <label className="admin-label">Internal description</label>
            <textarea
              className="admin-input"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Role notes for the team — the public posting is written on the next screen."
            />
          </div>

          {error && <div className="admin-alert admin-alert--err">{error}</div>}

          <div className="u-row">
            <button type="button" className="admin-btn admin-btn--primary" disabled={busy || !title.trim()} onClick={submit}>
              {busy ? "Creating…" : "Create req"}
            </button>
            <button type="button" className="admin-btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
          <div className="admin-hint">
            The req opens for hiring right away but stays off /careers until you publish it from the posting editor.
          </div>
        </div>
      </DetailDrawer>
    </>
  );
}

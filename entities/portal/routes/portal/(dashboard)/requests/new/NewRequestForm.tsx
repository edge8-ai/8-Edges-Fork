"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createProjectRequest } from "../actions";

// Portal mirror of the admin new-request form: contractor + title + brief,
// plus a company picker only when the member belongs to more than one company.
export function NewRequestForm({
  contractors,
  companies,
}: {
  contractors: { personId: string; name: string }[];
  companies: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [personId, setPersonId] = useState(contractors[0]?.personId ?? "");
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const r = await createProjectRequest({ companyId, contractorPersonId: personId, title, brief });
    setSaving(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    router.push(r.id ? `/portal/requests/${r.id}` : "/portal/requests");
    router.refresh();
  }

  return (
    <form className="admin-form" onSubmit={submit}>
      <label className="admin-field">
        <span>Contractor</span>
        <select value={personId} onChange={(e) => setPersonId(e.target.value)} required>
          {contractors.map((c) => (
            <option key={c.personId} value={c.personId}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {companies.length > 1 && (
        <label className="admin-field">
          <span>Company</span>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} required>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="admin-field">
        <span>Project title</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Monthly bookkeeping automation"
          required
        />
      </label>
      <label className="admin-field">
        <span>Brief — what needs doing, by when, and what &ldquo;done&rdquo; looks like</span>
        <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={8} required />
      </label>
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      <div className="admin-form-actions">
        <button type="submit" className="admin-btn admin-btn--primary" disabled={saving}>
          {saving ? "Sending…" : "Send to contractor"}
        </button>
      </div>
    </form>
  );
}

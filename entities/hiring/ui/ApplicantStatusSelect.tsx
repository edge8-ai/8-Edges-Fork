"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { APPLICATION_STATUS_OPTIONS, isDecisionStatus, PROPOSE_LABEL } from "@/entities/hiring/lib/application-status";

// The single applicant-status control used on all three talent surfaces: the
// contact 360 header, the applications shelf, and the rank shelf. It writes
// through the shared, admin-gated updateApplication action and refreshes so any
// status badges on the surrounding list/tab reflect the new value. The value is
// applied optimistically and reverts if the save fails.
export function ApplicantStatusSelect({
  applicationId,
  status,
  label,
  save,
  proposeHref = null,
}: {
  applicationId: string;
  status: string | null;
  label?: string;
  /**
   * Set for an application in a live hiring chain (Z.9, decision 10): Hired
   * and Rejected read "Propose…" and open its Decision card there, because
   * the server refuses to set them directly.
   */
  proposeHref?: string | null;
  // The action is a prop, not an import: a client component that imports a
  // server action drags that action's whole module graph into this entity's
  // browser door, and the door is what other entities' pages render this
  // through. The page passes hiring's own updateApplication.
  save: (applicationId: string, patch: { status: string }) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const [value, setValue] = useState(status ?? "active");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(next: string) {
    if (proposeHref && isDecisionStatus(next) && next !== value) {
      router.push(proposeHref);
      return;
    }
    const prev = value;
    setValue(next);
    setSaving(true);
    setError(null);
    const res = await save(applicationId, { status: next });
    setSaving(false);
    if (!res.ok) {
      setValue(prev);
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <span className="admin-field u-inline-stack u-m-0">
      {label && (
        <label className="admin-label">
          {label}
          {saving ? <span className="admin-cell-muted"> · saving…</span> : null}
        </label>
      )}
      <select
        className="admin-select"
        aria-label={label ?? "Applicant status"}
        value={value}
        disabled={saving}
        onChange={(e) => onChange(e.target.value)}
      >
        {APPLICATION_STATUS_OPTIONS.map(([v, l]) => (
          <option key={v} value={v}>
            {proposeHref && isDecisionStatus(v) && v !== value ? PROPOSE_LABEL[v] : l}
          </option>
        ))}
      </select>
      {error && <span className="admin-alert admin-alert--err">{error}</span>}
    </span>
  );
}

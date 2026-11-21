"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/kernel/ui/Badge";
import type { MayProp } from "@/kernel/identity/may-prop";
import { applyProposalCrmChanges } from "@/entities/crm/lib/proposal-actions";
import type { CrmPatchPart } from "@/entities/crm/lib/proposal-types";

// The CRM changes the call implies, on the proposal review page (Z.10,
// decision 4). Nothing is written until a person ticks it and presses Apply;
// a change already applied is shown as such and not offered again; a contact
// not in the CRM is only reported, for a person to add by hand. They record
// the call, not the proposal, so they stay if the proposal is rejected.

export function ProposalCrmChanges({ id, parts, applied, may }: { id: string; parts: CrmPatchPart[]; applied: Record<string, { at: string; by: string }>; may: MayProp }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<string[]>(() => parts.filter((p) => p.applicable && p.defaultOn && !applied[p.id]).map((p) => p.id));
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const canApply = may["crm.pipeline"] === true;

  if (parts.length === 0) return null;

  function toggle(partId: string, on: boolean) {
    setPicked((prev) => (on ? [...prev, partId] : prev.filter((p) => p !== partId)));
  }

  function apply() {
    setErr(null);
    setNote(null);
    start(async () => {
      const res = await applyProposalCrmChanges(id, picked);
      if (res.ok) {
        setNote(res.note ?? null);
        setPicked([]);
      } else setErr(res.error);
      router.refresh();
    });
  }

  const open = parts.filter((p) => p.applicable && !applied[p.id]).length;

  return (
    <div className="admin-card admin-section-card">
      <div className="u-row u-between u-items-center u-gap-2">
        <div className="admin-card-title admin-card-title--compact">CRM changes from the call</div>
        <Badge>Internal</Badge>
      </div>
      <p className="admin-cell-muted u-sm u-mt-1">Nothing here is written until you apply it. The changes record the call, so they stay if the proposal is rejected.</p>
      {err && <div className="admin-alert admin-alert--err u-mt-2">{err}</div>}
      {note && <div className="admin-alert admin-alert--ok u-mt-2">{note}</div>}
      <ul className="u-list-plain u-mt-2">
        {parts.map((p) => (
          <li key={p.id} className="u-row u-items-start u-gap-2 u-mb-2">
            {p.applicable && !applied[p.id] && canApply ? (
              <input type="checkbox" aria-label={p.what} checked={picked.includes(p.id)} disabled={pending} onChange={(e) => toggle(p.id, e.target.checked)} />
            ) : (
              <span className="u-w-auto" aria-hidden>
                {applied[p.id] ? "✓" : "·"}
              </span>
            )}
            <span className="u-sm">
              <span className="u-strong">{p.what}</span>
              <span className="admin-cell-muted"> · {p.change}</span>
              {applied[p.id] && <span className="admin-cell-muted"> · applied by {applied[p.id].by}</span>}
            </span>
          </li>
        ))}
      </ul>
      {canApply && open > 0 && (
        <button type="button" className="admin-btn admin-btn--primary u-mt-1" disabled={pending || picked.length === 0} onClick={apply}>
          {pending ? "Applying…" : `Apply ${picked.length} change${picked.length === 1 ? "" : "s"}`}
        </button>
      )}
    </div>
  );
}

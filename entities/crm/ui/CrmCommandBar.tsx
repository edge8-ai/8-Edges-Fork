"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSurfaceBase } from "@/kernel/shell/surface-client";
import { Badge } from "@/kernel/ui/Badge";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { startAssumeSession } from "@/entities/crm/lib/assume-actions";
import { archiveCompany, restoreCompany } from "@/entities/crm/lib/companies-actions";
import { archivePerson, restorePerson } from "@/entities/crm/lib/contacts-actions";
import { activateCompanyAffiliate, deactivateCompanyAffiliate } from "@/entities/crm/lib/affiliates-actions";

// Shared CRM action bar for the company + contact shelf and full profile. Holds
// the actions that apply to a record everywhere: Assume (view the client
// portal), Archive/Restore, and — for companies — Make/Remove affiliate.
// Delete permanently deliberately lives only in the profile Danger zone, not
// here. Client component (never routed through getRowPreview, which renders
// interactive content with dead clicks).

type ActionResult = { ok: true } | { ok: false; error: string };

export type CrmCommandBarProps = {
  kind: "company" | "contact";
  id: string;
  name: string;
  archived: boolean;
  // Company: its own id. Contact: the primary company id to view as (or null to
  // hide Assume when the contact has no company).
  assumeCompanyId?: string | null;
  // Company only. null / undefined hides the affiliate control (contacts defer).
  affiliate?: { active: boolean; code: string | null } | null;
  onChanged?: () => void;
};

export function CrmCommandBar({ kind, id, name, archived, assumeCompanyId, affiliate, onChanged }: CrmCommandBarProps) {
  const router = useRouter();
  // Assume stays admin-only (it opens the client portal as the client), so the
  // team surface does not offer it.
  const onAdmin = useSurfaceBase() === "/admin";
  const [assuming, startAssume] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    onChanged?.();
    router.refresh();
  }

  function run(fn: () => Promise<ActionResult>) {
    setError(null);
    setBusy(true);
    void (async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Failed.");
      else refresh();
      setBusy(false);
    })();
  }

  function assume() {
    if (!assumeCompanyId) return;
    setError(null);
    startAssume(async () => {
      const res = await startAssumeSession(assumeCompanyId);
      if (res && !res.ok) setError(res.error);
    });
  }

  const archiveAction = kind === "company" ? archiveCompany : archivePerson;
  const restoreAction = kind === "company" ? restoreCompany : restorePerson;
  const listNoun = kind === "company" ? "companies" : "contacts";

  return (
    <div className="u-row u-wrap u-gap-2">
      {assumeCompanyId && onAdmin && (
        <button type="button" className="admin-btn admin-btn--sm" disabled={assuming} onClick={assume}>
          {assuming ? "Opening…" : "Assume"}
        </button>
      )}

      {kind === "company" && affiliate != null && (
        affiliate.active ? (
          <span className="u-row">
            <Badge tone="ok">Affiliate{affiliate.code ? ` · ${affiliate.code}` : ""}</Badge>
            <button type="button" className="admin-btn admin-btn--sm" disabled={busy} onClick={() => run(() => deactivateCompanyAffiliate(id))}>
              Remove affiliate
            </button>
          </span>
        ) : (
          <button type="button" className="admin-btn admin-btn--sm" disabled={busy} onClick={() => run(() => activateCompanyAffiliate(id))}>
            Make affiliate
          </button>
        )
      )}

      {archived ? (
        <button type="button" className="admin-btn admin-btn--sm" disabled={busy} onClick={() => run(() => restoreAction(id))}>
          Restore
        </button>
      ) : (
        <ConfirmButton
          className="admin-btn admin-btn--sm"
          label="Archive"
          title={`Archive this ${kind}?`}
          body={`${name} will be hidden from the ${listNoun} list. You can restore it any time.`}
          confirmLabel="Archive"
          onConfirm={() => archiveAction(id)}
          onDone={refresh}
        />
      )}

      {error && (
        <span className="u-err u-sm">
          {error}
        </span>
      )}
    </div>
  );
}

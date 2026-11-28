"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import type { MayProp } from "@/kernel/identity/may-prop";
import { checkNewEntity, slugForName } from "@/entities/org/lib/legal-entity-changes";
import { checkReason } from "@/entities/org/lib/legal-entity-rules";
import { createLegalEntity } from "./company-actions";
import { EntityTypeSelect, Field } from "./LegalEntityFields";
import { COMPANY_ATOM } from "./LegalEntityDrawer";

// "+ Add legal entity": a Super Admin names a new registered company. Only the
// company itself is entered here; its registration details are filled in
// afterwards from the same list, by whoever keeps them.

const EMPTY = { name: "", legalName: "", country: "", entityType: "", baseCurrency: "" };

/** `may` answers org.legal-entities for the viewer (ADR 0014); without it the button is not rendered. */
export function AddLegalEntity({ may }: { may: MayProp }) {
  const router = useRouter();
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slug = slugForName(draft.name);
  const checked = checkNewEntity({ ...draft, slug });
  const reasonCheck = checkReason(reason);
  const touched = (key: keyof typeof EMPTY) => draft[key] !== "";
  // The address is made from the name, so a name it cannot be made from is the name's error.
  const fieldError = (key: keyof typeof EMPTY) =>
    touched(key) && !checked.ok ? (checked.fields[key] ?? (key === "name" ? checked.fields.slug : undefined) ?? null) : null;
  const set = (patch: Partial<typeof EMPTY>) => setDraft((d) => ({ ...d, ...patch }));

  function close() {
    setOpen(false);
    setDraft(EMPTY);
    setReason("");
    setError(null);
  }

  async function save() {
    if (!checked.ok || !reasonCheck.ok || busy) return;
    setBusy(true);
    setError(null);
    const res = await createLegalEntity({ ...draft, slug, reason });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
    close();
  }

  if (may[COMPANY_ATOM] !== true) return null;
  return (
    <>
      <button ref={button} type="button" className="admin-btn admin-btn--primary" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        + Add legal entity
      </button>
      <DetailDrawer
        open={open}
        onClose={close}
        className="admin-legal-drawer"
        eyebrow="Legal entity"
        title="Add a legal entity"
        restoreFocus={() => {
          button.current?.focus();
          return !!button.current;
        }}
      >
        <div className="admin-shelf-sections">
          <Field label="Name" hint={slug ? `What the organisation calls it. Its address will be ${slug}.` : "What the organisation calls it."} error={fieldError("name")}>
            {(a) => <input className="admin-input" value={draft.name} onChange={(e) => set({ name: e.target.value })} {...a} />}
          </Field>
          <Field label="Registered legal name" hint="Exactly as on the registration certificate." error={fieldError("legalName")}>
            {(a) => <input className="admin-input" value={draft.legalName} onChange={(e) => set({ legalName: e.target.value })} {...a} />}
          </Field>
          <div className="u-grid-2 u-gap-3">
            <Field label="Country" hint="Two letters, e.g. VN or US." error={fieldError("country")}>
              {(a) => <input className="admin-input" value={draft.country} maxLength={2} onChange={(e) => set({ country: e.target.value.toUpperCase() })} {...a} />}
            </Field>
            <Field label="Currency" hint="Three letters, e.g. VND or USD." error={fieldError("baseCurrency")}>
              {(a) => <input className="admin-input" value={draft.baseCurrency} maxLength={3} onChange={(e) => set({ baseCurrency: e.target.value.toUpperCase() })} {...a} />}
            </Field>
          </div>
          <Field label="Type" error={fieldError("entityType")}>
            {(a) => <EntityTypeSelect value={draft.entityType} current={null} onChange={(v) => set({ entityType: v })} {...a} />}
          </Field>
          <Field label="Why are you adding it?" hint="Required. It is kept with the change, beside your name." error={reason !== "" && !reasonCheck.ok ? reasonCheck.error : null}>
            {(a) => <textarea className="admin-textarea admin-legal-address" value={reason} onChange={(e) => setReason(e.target.value)} {...a} />}
          </Field>
          {error && <div className="admin-alert admin-alert--err">{error}</div>}
          <div className="admin-form-actions">
            <button type="button" className="admin-btn admin-btn--primary" disabled={!checked.ok || !reasonCheck.ok || busy} onClick={save}>
              {busy ? "Adding…" : "Add legal entity"}
            </button>
            <button type="button" className="admin-btn" onClick={close} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      </DetailDrawer>
    </>
  );
}

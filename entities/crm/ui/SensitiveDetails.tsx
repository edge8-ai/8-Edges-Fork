"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SensitiveInput, SensitiveRow } from "@/entities/crm/lib/people-sensitive";

type SaveResult = { ok: true; message: string } | { ok: false; error: string };

type FieldDef = { key: keyof SensitiveInput; label: string; type: "text" | "date" | "area" };
const FIELDS: FieldDef[] = [
  { key: "date_of_birth", label: "Date of birth", type: "date" },
  { key: "place_of_birth", label: "Place of birth", type: "text" },
  { key: "national_id_number", label: "National ID number", type: "text" },
  { key: "national_id_issue_date", label: "ID issue date", type: "date" },
  { key: "national_id_issue_place", label: "ID issue place", type: "text" },
  { key: "native_province", label: "Native province", type: "text" },
  { key: "marital_status", label: "Marital status", type: "text" },
  { key: "permanent_address", label: "Permanent address", type: "area" },
  { key: "current_address", label: "Current address", type: "area" },
  { key: "bank_name", label: "Bank", type: "text" },
  { key: "bank_account_number", label: "Bank account number", type: "text" },
  { key: "bank_branch", label: "Bank branch", type: "text" },
  { key: "tax_code", label: "Tax code (PIT)", type: "text" },
  { key: "social_insurance_number", label: "Social insurance number", type: "text" },
  { key: "notes", label: "Notes", type: "area" },
];

// A clickable thumbnail of an identity image. The ID scans stream through the
// admin-gated /id-image route (private bucket, per-request signed URL); the
// selfie is the public avatar URL. A broken image (e.g. a PDF scan) falls back
// to a plain link so HR can still open it.
function ThumbLink({ href, label }: { href: string; label: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={`Open ${label}`}
      className="u-stack u-gap-1 u-items-center u-link-plain"
    >
      {broken ? (
        <span
          className="admin-thumb admin-cell-muted"
        >
          Open
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- uploaded file of unknown size, and the onError fallback needs the raw element
        <img
          src={href}
          alt={label}
          onError={() => setBroken(true)}
          className="admin-thumb-img"
        />
      )}
      <span className="admin-cell-muted u-xs">{label}</span>
    </a>
  );
}

// Restricted PII card. PII stays hidden behind a reveal click (shoulder-surfing
// guard); an Edit toggle turns the fields into inputs. Reads/writes go through
// the admin-only, audited action passed by the server page. Identity images
// (ID front/back + selfie) render as thumbnails HR can click to view full size.
export function SensitiveDetails({
  row,
  hasIdFront,
  hasIdBack,
  idImageBaseHref,
  selfieUrl,
  action,
}: {
  row: SensitiveRow | null;
  hasIdFront: boolean;
  hasIdBack: boolean;
  idImageBaseHref: string;
  selfieUrl: string | null;
  action: (input: SensitiveInput) => Promise<SaveResult>;
}) {
  const router = useRouter();
  const [revealed, setRevealed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const initial = () => {
    const v: Record<string, string> = {};
    for (const f of FIELDS) v[f.key] = (row?.[f.key] as string | null) ?? "";
    return v;
  };
  const [values, setValues] = useState<Record<string, string>>(initial);

  function save() {
    setBanner(null);
    const input: SensitiveInput = {};
    for (const f of FIELDS) input[f.key] = values[f.key].trim() ? values[f.key].trim() : null;
    startTransition(async () => {
      const res = await action(input);
      if (res.ok) {
        setBanner({ tone: "ok", text: "Saved." });
        setEditing(false);
        router.refresh();
      } else {
        setBanner({ tone: "err", text: res.error });
      }
    });
  }

  if (!revealed) {
    return (
      <div className="admin-card admin-section-card">
        <h2 className="admin-card-title">Sensitive details</h2>
        <p className="admin-page-sub u-mt-0">
          Legal and payroll PII — national ID, bank, tax. Access is logged.
        </p>
        <button className="admin-btn" onClick={() => setRevealed(true)}>Reveal</button>
      </div>
    );
  }

  return (
    <div className="admin-card admin-section-card">
      <div className="u-row u-between u-gap-3">
        <h2 className="admin-card-title">Sensitive details</h2>
        <div className="u-row">
          {!editing && <button className="admin-btn admin-btn--sm" onClick={() => setRevealed(false)}>Hide</button>}
          {editing ? (
            <>
              <button className="admin-btn admin-btn--sm" onClick={() => { setEditing(false); setValues(initial()); }} disabled={pending}>Cancel</button>
              <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={save} disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </button>
            </>
          ) : (
            <button className="admin-btn admin-btn--sm" onClick={() => setEditing(true)}>Edit</button>
          )}
        </div>
      </div>

      {banner && (
        <div className={`admin-alert admin-alert--${banner.tone === "ok" ? "ok" : "err"} u-mt-3`}>
          {banner.text}
        </div>
      )}

      {editing ? (
        <div className="u-stack u-gap-3 u-mt-4">
          {FIELDS.map((f) => (
            <div className="admin-field" key={f.key}>
              <label className="admin-label" htmlFor={`sd-${f.key}`}>{f.label}</label>
              {f.type === "area" ? (
                <textarea id={`sd-${f.key}`} className="admin-input" rows={2}
                  value={values[f.key]} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
              ) : (
                <input id={`sd-${f.key}`} className="admin-input" type={f.type === "date" ? "date" : "text"}
                  value={values[f.key]} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
              )}
            </div>
          ))}
        </div>
      ) : (
        <dl className="admin-kv u-mt-4">
          {FIELDS.map((f) => (
            <div className="u-contents" key={f.key}>
              <dt>{f.label}</dt>
              <dd>{(row?.[f.key] as string | null) || "—"}</dd>
            </div>
          ))}
          <dt>Identity images</dt>
          <dd>
            {hasIdFront || hasIdBack || selfieUrl ? (
              <div className="u-row u-wrap">
                {hasIdFront && <ThumbLink href={`${idImageBaseHref}/front`} label="ID front" />}
                {hasIdBack && <ThumbLink href={`${idImageBaseHref}/back`} label="ID back" />}
                {selfieUrl && <ThumbLink href={selfieUrl} label="Selfie" />}
              </div>
            ) : (
              <span className="admin-cell-muted">Not uploaded</span>
            )}
          </dd>
        </dl>
      )}
    </div>
  );
}

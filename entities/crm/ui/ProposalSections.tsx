"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/kernel/ui/Badge";
import type { MayProp } from "@/kernel/identity/may-prop";
import { saveProposalEdit } from "@/entities/crm/lib/proposal-actions";
import type { ReviewSection } from "@/entities/crm/lib/proposal-view";
import { ProposalBody } from "./ProposalBody";

// The proposal as the client will read it, section by section in the fixed
// order, on the review page (Z.10). Each section says what it rests on, or
// warns that it rests on nothing; while the proposal waits on its approval,
// whoever works the pipeline may edit a section, which changes the version and
// asks for approval again. The model's own words stay on the row beside the
// edit, so a section edited by a person is marked.

type Props = {
  id: string;
  version: string | null;
  sections: ReviewSection[];
  lineItems: { label: string; note: string; amount: string }[];
  total: string | null;
  editable: boolean;
  may: MayProp;
};

function evidenceLine(evidence: string[]): string {
  if (evidence.length === 0) return "";
  const lines = evidence.filter((e) => /^L\d+$/.test(e));
  const facts = evidence.filter((e) => e.startsWith("fact:")).map((e) => e.slice(5).replace(/_/g, " "));
  const bands = evidence.filter((e) => e.startsWith("band:")).map((e) => e.slice(5));
  const parts = [lines.length ? `the call at ${lines.join(", ")}` : "", facts.length ? `facts: ${facts.join(", ")}` : "", bands.length ? `reference: ${bands.join(", ")}` : ""].filter(Boolean);
  return `Rests on ${parts.join("; ")}.`;
}

export function ProposalSections({ id, version, sections, lineItems, total, editable, may }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [heading, setHeading] = useState("");
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const canEdit = editable && may["crm.pipeline"] === true && version !== null;

  function open(s: ReviewSection) {
    setEditing(s.id);
    setHeading(s.heading);
    setBody(s.body);
    setErr(null);
    setNote(null);
  }

  function save(s: ReviewSection) {
    start(async () => {
      const res = await saveProposalEdit(id, { part: s.id, heading, body }, version ?? "");
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setEditing(null);
      setNote(res.note ?? null);
      router.refresh();
    });
  }

  return (
    <div>
      {note && <div className="admin-alert admin-alert--info u-mb-3">{note}</div>}
      {sections.map((s) => (
        <div key={s.id} role="region" className="admin-card admin-section-card" aria-labelledby={`proposal-${s.id}`}>
          <div className="u-row u-between u-items-center u-gap-2">
            <div id={`proposal-${s.id}`} className="admin-shelf-heading u-mb-0">
              {s.title}
            </div>
            <div className="u-row u-items-center u-gap-2">
              {s.edited && <Badge tone="info">Edited</Badge>}
              {canEdit && editing !== s.id && (
                <button type="button" className="admin-btn admin-btn--sm" disabled={pending || editing !== null} onClick={() => open(s)}>
                  Edit
                </button>
              )}
            </div>
          </div>

          {editing === s.id ? (
            <div className="admin-form u-mt-2">
              {err && <div className="admin-alert admin-alert--err">{err}</div>}
              <div className="admin-field">
                <label className="admin-label" htmlFor={`h-${s.id}`}>
                  Heading
                </label>
                <input id={`h-${s.id}`} className="admin-input" value={heading} onChange={(e) => setHeading(e.target.value)} />
              </div>
              <div className="admin-field">
                <label className="admin-label" htmlFor={`b-${s.id}`}>
                  Text (a blank line starts a paragraph; &quot;- &quot; starts a bullet)
                </label>
                <textarea id={`b-${s.id}`} className="admin-input admin-textarea--grow" rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
              </div>
              <div className="admin-form-actions">
                <button type="button" className="admin-btn admin-btn--primary" disabled={pending} onClick={() => save(s)}>
                  {pending ? "Saving…" : "Save the edit"}
                </button>
                <button type="button" className="admin-btn" disabled={pending} onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </div>
              <p className="admin-cell-muted u-xs">Saving changes the version, so the approval is asked again for the proposal as it then reads.</p>
            </div>
          ) : (
            <div className="u-mt-2">
              {s.heading && s.id !== "footer" && <div className="admin-card-title admin-card-title--tight u-mb-2">{s.heading}</div>}
              {s.id === "investment" && lineItems.length > 0 && (
                <dl className="admin-kv u-mb-2">
                  {lineItems.map((li, i) => (
                    <div key={i} className="u-contents">
                      <dt>{li.label}</dt>
                      <dd className="admin-cell-mono">{li.amount}</dd>
                    </div>
                  ))}
                  {total && (
                    <div className="u-contents">
                      <dt className="u-strong">Total</dt>
                      <dd className="admin-cell-mono u-strong">{total}</dd>
                    </div>
                  )}
                </dl>
              )}
              <ProposalBody body={s.body} />
            </div>
          )}

          {s.warnings.map((w) => (
            <div key={w} className="admin-alert admin-alert--warn u-mt-2 u-sm">
              {w}
            </div>
          ))}
          {s.warnings.length === 0 && s.evidence.length > 0 && <p className="admin-cell-muted u-xs u-mt-2">{evidenceLine(s.evidence)}</p>}
        </div>
      ))}
    </div>
  );
}

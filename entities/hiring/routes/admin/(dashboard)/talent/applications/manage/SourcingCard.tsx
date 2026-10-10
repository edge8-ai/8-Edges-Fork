"use client";

import { useState } from "react";
import { PersonSelect } from "@/entities/crm/client";
import { EditableDate, EditableSelect, EditableText } from "@/kernel/ui/InlineEdit";
import { APPLICATION_SOURCE_OPTIONS } from "@/entities/hiring/lib/recruiting-options";
import type { PersonOption } from "@/entities/crm";
import { updateApplication } from "@/entities/hiring/lib/application-actions";
import { toDateInput, ok } from "./shared";
import { ResumeField } from "./ResumeField";

export function SourcingCard(props: {
  appId: string;
  source: string | null;
  sourceDetail: string | null;
  referrerId: string | null;
  referrerOptions: PersonOption[];
  appliedAt: string | null;
  decidedAt: string | null;
  resumeDocumentId: string | null;
}) {
  const [referrerId, setReferrerId] = useState(props.referrerId ?? "");
  return (
    <section className="admin-card admin-section-card">
      <div className="admin-section-label u-mb-2">Sourcing</div>
      <dl className="admin-kv admin-kv--editable">
        <dt>Source</dt>
        <dd>
          <EditableSelect value={props.source ?? ""} placeholder="—" ariaLabel="Source"
            options={APPLICATION_SOURCE_OPTIONS.map(([v, l]) => ({ value: v, label: l }))}
            onSave={(v) => updateApplication(props.appId, { source: v || null }).then((r) => (r.ok ? ok() : r))} />
        </dd>
        <dt>Detail</dt>
        <dd>
          <EditableText value={props.sourceDetail ?? ""} placeholder="Board, event, who sourced…" ariaLabel="Source detail"
            onSave={(v) => updateApplication(props.appId, { source_detail: v.trim() || null }).then((r) => (r.ok ? ok() : r))} />
        </dd>
        <dt>Referrer</dt>
        <dd className="u-py-1">
          <PersonSelect
            value={referrerId}
            compact
            emptyLabel="No referrer"
            ariaLabel="Referred by"
            options={props.referrerOptions.map((o) => ({ value: o.id, label: o.name }))}
            onChange={(v) => {
              setReferrerId(v);
              updateApplication(props.appId, { referrer_person_id: v || null });
            }}
          />
        </dd>
        <dt>Applied</dt>
        <dd>
          <EditableDate value={toDateInput(props.appliedAt)} ariaLabel="Applied date"
            onSave={(v) => updateApplication(props.appId, { applied_at: v || null }).then((r) => (r.ok ? ok() : r))} />
        </dd>
        <dt>Decided</dt>
        <dd>
          <EditableDate value={toDateInput(props.decidedAt)} ariaLabel="Decided date"
            onSave={(v) => updateApplication(props.appId, { decided_at: v || null }).then((r) => (r.ok ? ok() : r))} />
        </dd>
        <dt>Resume</dt>
        <dd className="u-py-1">
          <ResumeField applicationId={props.appId} resumeDocumentId={props.resumeDocumentId} />
        </dd>
      </dl>
    </section>
  );
}

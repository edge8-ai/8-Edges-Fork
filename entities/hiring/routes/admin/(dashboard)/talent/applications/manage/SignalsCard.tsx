"use client";

import { useState } from "react";
import { EditableSelect, EditableText } from "@/kernel/ui/InlineEdit";
import { POOL_STATUS_OPTIONS } from "@/entities/hiring/lib/recruiting-options";
import { updateApplicantProfile } from "../actions";
import { aiHint } from "./shared";
import { SalaryField } from "./SalaryField";

export function SignalsCard(props: {
  personId: string;
  englishProficiency: string | null;
  canViewSalary: boolean;
  salaryExpectationCents: number | null;
  salaryExpectationCurrency: string | null;
  noticePeriod: string | null;
  poolStatus: string | null;
  doNotHire: boolean;
  aiEnglish: string | null;
  aiSalary: string | null;
  aiNotice: string | null;
}) {
  const [doNotHire, setDoNotHire] = useState(props.doNotHire);
  const english = aiHint(props.aiEnglish);
  const notice = aiHint(props.aiNotice);
  return (
    <section className="admin-card admin-section-card">
      <div className="admin-section-label u-mb-1">Signals</div>
      <div className="admin-hint u-mb-2">
        Recruiter-verified. Overrides the AI screen; leave blank to keep showing the AI value.
      </div>
      <dl className="admin-kv admin-kv--editable">
        <dt>English</dt>
        <dd>
          <EditableText value={props.englishProficiency ?? ""} fallback={english} placeholder="Add…" ariaLabel="English proficiency"
            onSave={(v) => updateApplicantProfile(props.personId, { english_proficiency: v.trim() || null })} />
        </dd>
        {props.canViewSalary && (
          <>
            <dt>Salary</dt>
            <dd className="u-py-1">
              <SalaryField
                personId={props.personId}
                cents={props.salaryExpectationCents}
                currency={props.salaryExpectationCurrency}
                aiFallback={aiHint(props.aiSalary)}
              />
            </dd>
          </>
        )}
        <dt>Notice</dt>
        <dd>
          <EditableText value={props.noticePeriod ?? ""} fallback={notice} placeholder="Add…" ariaLabel="Notice period"
            onSave={(v) => updateApplicantProfile(props.personId, { notice_period: v.trim() || null })} />
        </dd>
        <dt>Pool</dt>
        <dd>
          <EditableSelect value={props.poolStatus ?? ""} placeholder="—" ariaLabel="Pool status"
            options={POOL_STATUS_OPTIONS.map(([v, l]) => ({ value: v, label: l }))}
            onSave={(v) => updateApplicantProfile(props.personId, { pool_status: v || null })} />
        </dd>
      </dl>
      <label className="u-row u-mt-3 u-pointer">
        <input
          type="checkbox"
          checked={doNotHire}
          onChange={(e) => {
            const next = e.target.checked;
            setDoNotHire(next);
            updateApplicantProfile(props.personId, { do_not_hire: next }).then((r) => {
              if (!r.ok) setDoNotHire(!next);
            });
          }}
        />
        <span>
          Do not hire <span className="admin-cell-muted">(would not consider again)</span>
        </span>
      </label>
    </section>
  );
}

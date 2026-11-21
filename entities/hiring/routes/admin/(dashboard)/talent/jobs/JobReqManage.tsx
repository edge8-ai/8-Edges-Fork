"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { useAutosave } from "@/kernel/ui/useAutosave";
import { AutosaveIndicator } from "@/kernel/ui/AutosaveStatus";
import { formatDate } from "@/kernel/ui/format";
import { closeJobReq, deleteJobReq, reopenJobReq, updateJobReq, type JobReqPatch } from "./actions";
import { CloseReqPanel, closedLine } from "./CloseReq";
import { JobPeopleFields, type JobFieldOptions } from "./JobPeopleFields";
import { pastStatusLabel } from "./roles";
import type { MayProp } from "@/kernel/identity/may-prop";
import {
  EMPLOYMENT_TYPE_OPTIONS as EMPLOYMENT_OPTIONS,
  SALARY_CURRENCIES,
  WORKPLACE_OPTIONS,
} from "@/entities/hiring/lib/recruiting-options";

export type JobReqManageData = {
  id: string;
  title: string;
  companyName: string | null;
  status: string | null;
  employmentType: string;
  location: string | null;
  remotePolicy: string | null;
  salaryMinCents: number | null;
  salaryMaxCents: number | null;
  currency: string;
  openedAt: string | null;
  closedAt: string | null;
  description: string | null;
  isPublic: boolean;
  slug: string | null;
  applicationCount: number;
  hiringManagerId: string | null;
  hiringManagerName: string | null;
  /** The client a staffing job is for (companies.id), or null for our own hire. */
  clientCompanyId: string | null;
  /** Our recruiter (team_members.id), who gets candidates' replies. */
  recruiterId: string | null;
  /** How many people the job hires; null when it does not say. */
  headcount: number | null;
};

type JobForm = {
  title: string;
  employmentType: string;
  remotePolicy: string;
  location: string;
  headcount: string;
  clientId: string;
  managerId: string;
  recruiterId: string;
  salaryMin: string;
  salaryMax: string;
  currency: string;
  description: string;
};

const money = (v: string) => (v.trim() === "" ? null : Number(v));

// Each form field and the column it saves to. Several are saved at once when
// the client changes, because a new client clears the hiring manager.
const COLUMN: { [K in keyof JobForm]: (v: string) => JobReqPatch } = {
  title: (v) => ({ title: v }),
  employmentType: (v) => ({ employment_type: v }),
  remotePolicy: (v) => ({ remote_policy: v || null }),
  location: (v) => ({ location: v || null }),
  headcount: (v) => ({ headcount: Number(v) }),
  clientId: (v) => ({ client_company_id: v || null }),
  managerId: (v) => ({ hiring_manager_id: v || null }),
  recruiterId: (v) => ({ recruiter_id: v || null }),
  salaryMin: (v) => ({ salary_min: money(v) }),
  salaryMax: (v) => ({ salary_max: money(v) }),
  currency: (v) => ({ currency: v }),
  description: (v) => ({ description: v || null }),
};

// One job, in the drawer its row or card opens: every field it has, edited in
// place and saved as each one is left, in four groups (the job, who it is for,
// pay, notes). Closing, reopening and deleting sit below; the hiring board and
// the careers ad are a click away. Without hiring.ats, which every action
// here asks for, the fields are read-only and the buttons are not drawn.
export function JobReqManage({ req, options, may }: { req: JobReqManageData; options: JobFieldOptions; may: MayProp }) {
  const router = useRouter();
  const canEdit = may["hiring.ats"] === true;
  const id = useId();
  const isOpen = req.status === "open";
  const live = req.isPublic && isOpen;
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);

  const { form, field, commit, commitMany, status } = useAutosave<JobForm>(
    {
      title: req.title,
      employmentType: req.employmentType,
      remotePolicy: req.remotePolicy ?? "",
      location: req.location ?? "",
      headcount: String(req.headcount ?? 1),
      clientId: req.clientCompanyId ?? "",
      managerId: req.hiringManagerId ?? "",
      recruiterId: req.recruiterId ?? "",
      salaryMin: req.salaryMinCents != null ? String(req.salaryMinCents / 100) : "",
      salaryMax: req.salaryMaxCents != null ? String(req.salaryMaxCents / 100) : "",
      currency: req.currency.toLowerCase(),
      description: req.description ?? "",
    },
    (patch) =>
      updateJobReq(req.id, Object.assign({}, ...Object.entries(patch).map(([k, v]) => COLUMN[k as keyof JobForm](String(v))))),
  );
  const currencies = SALARY_CURRENCIES.includes(form.currency) ? SALARY_CURRENCIES : [form.currency, ...SALARY_CURRENCIES];
  const client = options.companies.find((c) => c.id === form.clientId) ?? null;

  // A text field saves when it is left; a select saves as soon as it changes.
  const text = (key: keyof JobForm) => ({
    id: `${id}-${key}`,
    value: form[key],
    onChange: (e: { target: { value: string } }) => field(key, e.target.value),
    onBlur: (e: { target: { value: string } }) => commit(key, e.target.value),
  });
  const pick = (key: keyof JobForm) => ({
    id: `${id}-${key}`,
    value: form[key],
    onChange: (e: { target: { value: string } }) => {
      field(key, e.target.value);
      commit(key, e.target.value);
    },
  });

  async function reopen() {
    setBusy(true);
    setMsg(null);
    const r = await reopenJobReq(req.id);
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setMsg({ ok: true, text: "Job reopened." });
    router.refresh();
  }

  const apps = req.applicationCount;
  return (
    <>
      <dl className="admin-kv u-mb-4">
        <dt>Status</dt>
        <dd>
          {req.status && <Badge tone={statusTone(req.status)}>{pastStatusLabel(req.status)}</Badge>}{" "}
          {live && <Badge tone="ok">Live on careers page</Badge>}
        </dd>
        <dt>Applicants</dt>
        <dd>
          {apps === 0 ? (
            "None yet"
          ) : (
            <Link href={`/admin/talent/jobs/${req.id}`} className="admin-cell-strong">
              {apps} · Open hiring board
            </Link>
          )}
        </dd>
        <dt>Opened</dt>
        <dd>{req.openedAt ? formatDate(req.openedAt) : "—"}</dd>
        {req.closedAt && (
          <>
            <dt>Closed</dt>
            <dd>{formatDate(req.closedAt)}</dd>
          </>
        )}
        {req.slug && (
          <>
            <dt>Careers ad</dt>
            <dd>
              {live ? (
                <a href={`${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/careers/${req.slug}/`} target="_blank" rel="noreferrer">
                  View ad ↗
                </a>
              ) : (
                <span className="admin-cell-muted">Not live</span>
              )}
            </dd>
          </>
        )}
      </dl>

      <fieldset className="admin-form" disabled={!canEdit}>
        <div className="u-row u-end u-sm">
          <AutosaveIndicator status={status} />
        </div>

        <p className="admin-section-label">The job</p>
        <div className="admin-field">
          <label className="admin-label" htmlFor={`${id}-title`}>Job title</label>
          <input className="admin-input" {...text("title")} />
        </div>
        <div className="u-grid-auto-sm">
          <div className="admin-field">
            <label className="admin-label" htmlFor={`${id}-employmentType`}>Employment type</label>
            <select className="admin-select" {...pick("employmentType")}>
              {EMPLOYMENT_OPTIONS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor={`${id}-remotePolicy`}>Workplace</label>
            <select className="admin-select" {...pick("remotePolicy")}>
              {WORKPLACE_OPTIONS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="u-grid-auto-sm">
          <div className="admin-field">
            <label className="admin-label" htmlFor={`${id}-location`}>Location</label>
            <input className="admin-input" placeholder="e.g. Ho Chi Minh City" {...text("location")} />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor={`${id}-headcount`}>Seats to fill</label>
            <input className="admin-input" type="number" min="1" step="1" inputMode="numeric" {...text("headcount")} />
          </div>
        </div>
        <div className="admin-hint">The card says the job is filled once this many people are hired.</div>

        <JobPeopleFields
          value={{ clientId: form.clientId, managerId: form.managerId, recruiterId: form.recruiterId }}
          onChange={(patch) => void commitMany(patch)}
          options={options}
          savedManagerName={req.hiringManagerName}
          may={may}
        />

        <p className="admin-section-label u-mt-4">Pay</p>
        <div className="u-grid-2-fixed">
          <div className="admin-field">
            <label className="admin-label" htmlFor={`${id}-salaryMin`}>Salary from</label>
            <input className="admin-input" type="number" min="0" step="0.01" inputMode="decimal" {...text("salaryMin")} />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor={`${id}-salaryMax`}>Salary to</label>
            <input className="admin-input" type="number" min="0" step="0.01" inputMode="decimal" {...text("salaryMax")} />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor={`${id}-currency`}>Currency</label>
            <select className="admin-select" {...pick("currency")}>
              {currencies.map((c) => (
                <option key={c} value={c}>{c.toUpperCase()}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="admin-hint">
          {client
            ? `Put the maximum ${client.name} gave you in Salary to, and leave Salary from empty: it shows as "Up to".`
            : "Leave either empty when there is no floor or no ceiling."}
        </div>

        <p className="admin-section-label u-mt-4">Notes for the team</p>
        <div className="admin-field">
          <label className="admin-label" htmlFor={`${id}-description`}>Notes</label>
          <textarea className="admin-input" rows={4} {...text("description")} />
          <div className="admin-hint">
            For the team. The careers ad is written under Hiring board and careers ad; a published job with no ad text of its
            own shows these notes as its ad.
          </div>
        </div>
        {status.state === "error" && <div className="admin-alert admin-alert--err">{status.error}</div>}
      </fieldset>

      <div className="u-row u-wrap u-mt-4">
        <Link href={`/admin/talent/jobs/${req.id}`} className="admin-btn">
          Hiring board and careers ad
        </Link>
        {canEdit && isOpen && !closing && (
          <button type="button" className="admin-btn" onClick={() => { setClosing(true); setMsg(null); }}>
            Close job…
          </button>
        )}
        {canEdit && !isOpen && (
          <button type="button" className="admin-btn" onClick={reopen} disabled={busy}>
            {busy ? "Reopening…" : "Reopen"}
          </button>
        )}
      </div>

      {closing && (
        <div className="u-mt-3">
          <CloseReqPanel
            close={(outcome) => closeJobReq(req.id, outcome)}
            onCancel={() => setClosing(false)}
            onClosed={(outcome) => {
              setClosing(false);
              setMsg({ ok: true, text: closedLine(outcome) });
            }}
          />
        </div>
      )}
      {/* The outcome of a close or a reopen. JobReqsTable keys this component
          by job, so a message never carries over to the next one. */}
      {msg && <div className={`admin-alert admin-alert--${msg.ok ? "ok" : "err"} u-mt-3`}>{msg.text}</div>}

      {canEdit && (
        <div className="admin-danger-zone u-mt-4">
          <div className="admin-danger-zone-title">Delete this job</div>
          <div className="admin-danger-row">
            <span className="admin-danger-row-text">
              {apps > 0
                ? `This job has ${apps} application${apps === 1 ? "" : "s"}, so it can't be deleted. Close it instead: that keeps their history.`
                : "Deletes the job and its hiring stages for good."}
            </span>
            <ConfirmButton
              label="Delete job"
              disabled={apps > 0}
              title="Delete this job for good?"
              body={
                <>
                  This deletes <strong>{req.title || "this job"}</strong> and its hiring stages. It cannot be undone.
                </>
              }
              confirmLabel="Delete job"
              onConfirm={() => deleteJobReq(req.id)}
              onDone={() => router.refresh()}
            />
          </div>
        </div>
      )}
    </>
  );
}

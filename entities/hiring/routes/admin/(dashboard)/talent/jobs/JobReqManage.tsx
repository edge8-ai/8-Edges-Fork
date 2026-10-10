"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PersonSelect } from "@/entities/crm/client";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { useAutosave } from "@/kernel/ui/useAutosave";
import { AutosaveIndicator } from "@/kernel/ui/AutosaveStatus";
import { formatDate, humanize } from "@/kernel/ui/format";
import { closeJobReq, deleteJobReq, reopenJobReq, updateJobReq } from "./actions";

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
};

const EMPLOYMENT_OPTIONS = [
  ["full_time", "Full-time"],
  ["part_time", "Part-time"],
  ["contract", "Contract"],
  ["intern", "Internship"],
  ["temp", "Temporary"],
  ["advisor", "Advisor"],
] as const;

const REMOTE_OPTIONS = [
  ["", "Not set"],
  ["onsite", "Onsite"],
  ["hybrid", "Hybrid"],
  ["remote", "Remote"],
] as const;

const CLOSE_OUTCOMES = [
  ["filled", "Filled — we hired"],
  ["closed", "Closed — no hire"],
  ["cancelled", "Cancelled"],
] as const;

const CURRENCIES = ["usd", "eur", "gbp", "aud", "sgd", "vnd"];

type JobReqFieldForm = {
  title: string;
  employmentType: string;
  location: string;
  remotePolicy: string;
  salaryMin: string;
  salaryMax: string;
  currency: string;
  description: string;
  hiringManager: string;
};

// Manage surface for one job req, rendered in the list row's side shelf:
// every field visible, edit in place, close/reopen with an outcome, delete
// when the req has no applications. The full page (hiring board + public
// posting editor) stays a click away.
export function JobReqManage({
  req,
  managers,
}: {
  req: JobReqManageData;
  managers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const isOpen = req.status === "open";
  const live = req.isPublic && isOpen;

  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [closing, setClosing] = useState(false);
  const [outcome, setOutcome] = useState("");
  const [busy, setBusy] = useState(false);

  const { form, field, commit, status } = useAutosave<JobReqFieldForm>(
    {
      title: req.title,
      employmentType: req.employmentType,
      location: req.location ?? "",
      remotePolicy: req.remotePolicy ?? "",
      salaryMin: req.salaryMinCents != null ? String(req.salaryMinCents / 100) : "",
      salaryMax: req.salaryMaxCents != null ? String(req.salaryMaxCents / 100) : "",
      currency: req.currency.toLowerCase(),
      description: req.description ?? "",
      hiringManager: req.hiringManagerId ?? "",
    },
    saveField,
  );
  const { title, employmentType, location, remotePolicy, salaryMin, salaryMax, currency, description, hiringManager } =
    form;
  const currencyOptions = CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES];

  async function saveField(patch: Partial<JobReqFieldForm>) {
    const [key, value] = Object.entries(patch)[0] as [keyof JobReqFieldForm, string];
    switch (key) {
      case "title":
        return updateJobReq(req.id, { title: value });
      case "employmentType":
        return updateJobReq(req.id, { employment_type: value });
      case "location":
        return updateJobReq(req.id, { location: value || null });
      case "remotePolicy":
        return updateJobReq(req.id, { remote_policy: value || null });
      case "salaryMin":
        return updateJobReq(req.id, { salary_min: value.trim() === "" ? null : Number(value) });
      case "salaryMax":
        return updateJobReq(req.id, { salary_max: value.trim() === "" ? null : Number(value) });
      case "currency":
        return updateJobReq(req.id, { currency: value });
      case "description":
        return updateJobReq(req.id, { description: value || null });
      case "hiringManager":
        return updateJobReq(req.id, { hiring_manager_id: value || null });
      default:
        return { ok: true as const };
    }
  }

  async function close() {
    if (!outcome) return;
    setBusy(true);
    setMsg(null);
    const r = await closeJobReq(req.id, outcome);
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setClosing(false);
    setMsg({ ok: true, text: `Req marked ${outcome}.` });
    router.refresh();
  }

  async function reopen() {
    setBusy(true);
    setMsg(null);
    const r = await reopenJobReq(req.id);
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setMsg({ ok: true, text: "Req reopened." });
    router.refresh();
  }

  return (
    <>
      <dl className="admin-kv u-mb-4">
        <dt>Status</dt>
        <dd>
          {req.status && <Badge tone={statusTone(req.status)}>{humanize(req.status)}</Badge>}{" "}
          {live && <Badge tone="ok">Live on /careers</Badge>}
        </dd>
        <dt>Company</dt>
        <dd>{req.companyName || "—"}</dd>
        <dt>Applicants</dt>
        <dd>
          {req.applicationCount === 0 ? (
            "None yet"
          ) : (
            <Link href={`/admin/talent/jobs/${req.id}`} className="admin-cell-strong">
              {req.applicationCount} — open hiring board
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
            <dt>Public URL</dt>
            <dd>
              {live ? (
                <a href={`${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/careers/${req.slug}/`} target="_blank" rel="noreferrer">
                  /careers/{req.slug} ↗
                </a>
              ) : (
                <span className="admin-cell-muted">/careers/{req.slug} (not live)</span>
              )}
            </dd>
          </>
        )}
      </dl>

      <div className="admin-form">
        <div className="u-row u-end u-sm">
          <AutosaveIndicator status={status} />
        </div>

        <div className="admin-field">
          <label className="admin-label">Title</label>
          <input
            className="admin-input"
            value={title}
            onChange={(e) => field("title", e.target.value)}
            onBlur={(e) => commit("title", e.target.value)}
          />
        </div>
        <div className="u-grid-auto-sm">
          <div className="admin-field">
            <label className="admin-label">Type</label>
            <select
              className="admin-select"
              value={employmentType}
              onChange={(e) => {
                field("employmentType", e.target.value);
                commit("employmentType", e.target.value);
              }}
            >
              {EMPLOYMENT_OPTIONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="admin-field">
            <label className="admin-label">Remote policy</label>
            <select
              className="admin-select"
              value={remotePolicy}
              onChange={(e) => {
                field("remotePolicy", e.target.value);
                commit("remotePolicy", e.target.value);
              }}
            >
              {REMOTE_OPTIONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="admin-field">
          <label className="admin-label">Hiring manager</label>
          <PersonSelect
            value={hiringManager}
            onChange={(id) => commit("hiringManager", id)}
            emptyLabel="Unassigned"
            options={managers.map((m) => ({ value: m.id, label: m.name }))}
          />
          <div className="admin-hint">Open reqs show under their hiring manager on the team org chart.</div>
        </div>
        <div className="admin-field">
          <label className="admin-label">Location</label>
          <input
            className="admin-input"
            value={location}
            onChange={(e) => field("location", e.target.value)}
            onBlur={(e) => commit("location", e.target.value)}
          />
        </div>
        <div className="u-grid-2-fixed">
          <div className="admin-field">
            <label className="admin-label">Salary min</label>
            <input
              className="admin-input"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={salaryMin}
              onChange={(e) => field("salaryMin", e.target.value)}
              onBlur={(e) => commit("salaryMin", e.target.value)}
            />
          </div>
          <div className="admin-field">
            <label className="admin-label">Salary max</label>
            <input
              className="admin-input"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={salaryMax}
              onChange={(e) => field("salaryMax", e.target.value)}
              onBlur={(e) => commit("salaryMax", e.target.value)}
            />
          </div>
          <div className="admin-field">
            <label className="admin-label">Currency</label>
            <select
              className="admin-select"
              value={currency}
              onChange={(e) => {
                field("currency", e.target.value);
                commit("currency", e.target.value);
              }}
            >
              {currencyOptions.map((c) => (
                <option key={c} value={c}>
                  {c.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="admin-field">
          <label className="admin-label">Internal description</label>
          <textarea
            className="admin-input"
            rows={4}
            value={description}
            onChange={(e) => field("description", e.target.value)}
            onBlur={(e) => commit("description", e.target.value)}
          />
        </div>
        {status.state === "error" && <div className="admin-alert admin-alert--err">{status.error}</div>}
      </div>

      <div className="u-row u-wrap u-mt-4">
        <Link href={`/admin/talent/jobs/${req.id}`} className="admin-btn">
          Hiring board & posting
        </Link>
        {isOpen && !closing && (
          <button type="button" className="admin-btn" onClick={() => { setClosing(true); setOutcome(""); }}>
            Close…
          </button>
        )}
        {!isOpen && (
          <button type="button" className="admin-btn" onClick={reopen} disabled={busy}>
            {busy ? "Reopening…" : "Reopen"}
          </button>
        )}
      </div>

      {closing && (
        <div className="u-stack u-mt-3">
          <select className="admin-select" aria-label="Close outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="">How did this req end?</option>
            {CLOSE_OUTCOMES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <div className="u-row">
            <button type="button" className="admin-btn admin-btn--primary" disabled={!outcome || busy} onClick={close}>
              {busy ? "Closing…" : "Close req"}
            </button>
            <button type="button" className="admin-btn" onClick={() => setClosing(false)}>
              Cancel
            </button>
          </div>
          <div className="admin-hint">Closing takes the role off /careers. Applications and history are kept.</div>
        </div>
      )}

      <div className="admin-danger-zone u-mt-4">
        <div className="admin-danger-zone-title">Danger zone</div>
        <div className="admin-danger-row">
          <span className="admin-danger-row-text">
            {req.applicationCount > 0
              ? `Delete is blocked while ${req.applicationCount} application${req.applicationCount === 1 ? "" : "s"} reference this req — close it instead.`
              : "Permanently delete this req and its pipeline stages. Cannot be undone."}
          </span>
          <ConfirmButton
            label="Delete permanently"
            title="Permanently delete this job req?"
            body={
              <>
                This deletes <strong>{req.title || "this req"}</strong> and its pipeline stages. This cannot be undone.
              </>
            }
            confirmLabel="Delete permanently"
            onConfirm={() => deleteJobReq(req.id)}
            onDone={() => router.refresh()}
          />
        </div>
      </div>
    </>
  );
}

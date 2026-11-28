"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import { EditableSelect } from "@/kernel/ui/InlineEdit";
import { EditableTypedDate } from "@/kernel/ui/EditableTypedDate";
import { businessDate, saigonToday } from "@/kernel/config/dates";
import { changeJobStatus, updateJobDates } from "./actions";
import { CLOSED_STATUSES, JOB_STATUSES, jobDatesError } from "./job-status";
import { pastStatusLabel } from "./roles";
import type { JobReqManageData } from "./JobReqManage";
import type { MayProp } from "@/kernel/identity/may-prop";

// The facts at the head of a job's drawer: its status, applicants, when it
// opened and closed, and its careers ad. With hiring.ats the status and both
// dates are edited in place (T1.100), the dates typed as DD/MM/YYYY; without
// it they read as text.
export function JobFacts({
  req,
  may,
  live,
  onNote,
}: {
  req: JobReqManageData;
  may: MayProp;
  live: boolean;
  /** What a status change did beyond the status, for the drawer's message line; null clears it. */
  onNote: (note: { ok: boolean; text: string } | null) => void;
}) {
  const router = useRouter();
  // Both actions here ask hiring.ats; without it nothing is editable (ADR 0014).
  const canEdit = may["hiring.ats"] === true;
  const apps = req.applicationCount;
  const jobStatus = req.status ?? "";
  const badge = (s: string) => <Badge tone={statusTone(s)}>{pastStatusLabel(s)}</Badge>;
  // The days the drawer shows, which is what HR types and what the rules compare.
  const openedDay = req.openedAt ? businessDate(req.openedAt) : "";
  const closedDay = req.closedAt ? businessDate(req.closedAt) : "";
  const datesError = (d: { opened?: string; closed?: string }) =>
    jobDatesError({
      opened: (d.opened ?? openedDay) || null,
      closed: (d.closed ?? closedDay) || null,
      status: jobStatus,
      today: saigonToday(),
    });
  // An editor sees Closed whenever the job is over, empty or not, so a missing
  // date can be filled in; a reader sees it only when there is one.
  const showClosed = canEdit ? CLOSED_STATUSES.has(jobStatus) : Boolean(req.closedAt);
  // Read-only values among editable ones sit at the inset of the editable text.
  const plain = canEdit ? "admin-kv-plain" : undefined;

  async function saveStatus(next: string) {
    onNote(null);
    const r = await changeJobStatus(req.id, next);
    if (!r.ok) return r;
    if (r.note) onNote({ ok: true, text: r.note });
    router.refresh();
    return { ok: true as const };
  }

  return (
    <dl className={canEdit ? "admin-kv admin-kv--editable u-mb-4" : "admin-kv u-mb-4"}>
      <dt>Status</dt>
      <dd>
        {canEdit ? (
          <EditableSelect
            picker
            value={jobStatus}
            options={JOB_STATUSES.map((s) => ({ value: s, label: pastStatusLabel(s) }))}
            placeholder=""
            ariaLabel={`Status: ${pastStatusLabel(jobStatus)}. Change`}
            render={(s) => (
              <>
                {badge(s)}
                {live && s === jobStatus && (
                  <>
                    {" "}
                    <Badge tone="ok">Live on careers page</Badge>
                  </>
                )}
              </>
            )}
            onSave={saveStatus}
          />
        ) : (
          <>
            {req.status && badge(req.status)}{" "}
            {live && <Badge tone="ok">Live on careers page</Badge>}
          </>
        )}
      </dd>
      <dt>Applicants</dt>
      <dd>
        <span className={plain}>
          {apps === 0 ? (
            "None yet"
          ) : (
            <Link href={`/admin/talent/jobs/${req.id}`} className="admin-cell-strong">
              {apps} · Open hiring board
            </Link>
          )}
        </span>
      </dd>
      <dt>Opened</dt>
      <dd>
        {canEdit ? (
          <EditableTypedDate
            value={openedDay}
            ariaLabel="Opened, DD/MM/YYYY"
            validate={(opened) => datesError({ opened })}
            onSave={(v) => updateJobDates(req.id, { opened: v || null })}
          />
        ) : req.openedAt ? (
          formatDate(req.openedAt)
        ) : (
          "—"
        )}
      </dd>
      {showClosed && (
        <>
          <dt>Closed</dt>
          <dd>
            {canEdit ? (
              <EditableTypedDate
                value={closedDay}
                ariaLabel="Closed, DD/MM/YYYY"
                validate={(closed) => datesError({ closed })}
                onSave={(v) => updateJobDates(req.id, { closed: v || null })}
              />
            ) : (
              formatDate(req.closedAt)
            )}
          </dd>
        </>
      )}
      {req.slug && (
        <>
          <dt>Careers ad</dt>
          <dd>
            <span className={plain}>
              {live ? (
                <a href={`${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/careers/${req.slug}/`} target="_blank" rel="noreferrer">
                  View ad ↗
                </a>
              ) : (
                <span className="admin-cell-muted">Not live</span>
              )}
            </span>
          </dd>
        </>
      )}
    </dl>
  );
}

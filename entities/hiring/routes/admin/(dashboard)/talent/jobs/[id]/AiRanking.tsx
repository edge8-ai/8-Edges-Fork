"use client";

import React, { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, type BadgeTone } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import { rescanApplication, scanUnscannedApplications } from "./actions";
import type { AiScreenSummary } from "@/entities/hiring/lib/resume-screen";

export type AiRankRow = {
  id: string;
  candidateName: string | null;
  personId: string | null;
  stageName: string | null;
  aiRating: number | null;
  aiStatus: string | null; // pending | done | failed | null (never scanned)
  aiError: string | null;
  screenedAt: string | null;
  summary: AiScreenSummary | null;
  resumeDocumentId: string | null;
};

function screenTone(status: string | null): BadgeTone | undefined {
  if (status === "done") return "ok";
  if (status === "pending") return "warn";
  if (status === "failed") return "err";
  return undefined;
}

// AI stack rank for one job req: applications ordered by Claude's fit rating,
// each expanding to the templated screen summary. Whole table is client-owned
// (rows + expansion + actions) per the admin manage-list pattern.
export function AiRanking({ jobReqId, rows }: { jobReqId: string; rows: AiRankRow[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const ranked = useMemo(
    () =>
      [...rows].sort((a, b) => {
        if (a.aiRating == null && b.aiRating == null) return 0;
        if (a.aiRating == null) return 1;
        if (b.aiRating == null) return -1;
        return b.aiRating - a.aiRating;
      }),
    [rows],
  );

  const unscanned = rows.filter((r) => r.aiStatus == null || r.aiStatus === "failed").length;

  const rescan = (applicationId: string) => {
    setBusyId(applicationId);
    setNotice(null);
    startTransition(async () => {
      const res = await rescanApplication(applicationId, jobReqId);
      setBusyId(null);
      if (!res.ok) setNotice(res.error);
      router.refresh();
    });
  };

  const scanAll = () => {
    setNotice(null);
    startTransition(async () => {
      const res = await scanUnscannedApplications(jobReqId);
      setNotice(
        res.ok
          ? `Scanned ${res.scanned} application${res.scanned === 1 ? "" : "s"}${res.failed ? `, ${res.failed} failed` : ""}.`
          : res.error,
      );
      router.refresh();
    });
  };

  if (rows.length === 0) return null;

  return (
    <div className="u-mt-6">
      <div className="u-row u-gap-3 u-mb-3">
        <div className="u-lg u-strong">AI resume screen</div>
        {unscanned > 0 && (
          <button type="button" className="admin-btn admin-btn--sm" onClick={scanAll} disabled={isPending}>
            {isPending && busyId == null ? "Scanning…" : `Scan ${unscanned} unscanned`}
          </button>
        )}
      </div>
      {notice && (
        <div className="admin-cell-muted u-mb-2">
          {notice}
        </div>
      )}

      <div className="admin-table-wrap">
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th className="admin-th--xs">#</th>
                <th>Candidate</th>
                <th className="u-right">AI rating</th>
                <th>Screen</th>
                <th>Stage</th>
                <th>Scanned</th>
                <th className="u-w-90" />
              </tr>
            </thead>
            <tbody>
              {ranked.map((r, i) => {
                const open = openId === r.id;
                const s = r.summary;
                return (
                  <React.Fragment key={r.id}>
                    <tr
                      className="is-clickable"
                      onClick={() => setOpenId(open ? null : r.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setOpenId(open ? null : r.id);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-expanded={open}
                    >
                      <td className="admin-cell-mono">{r.aiRating != null ? i + 1 : "—"}</td>
                      <td>
                        <span className={r.candidateName ? "admin-cell-strong" : "admin-cell-muted"}>
                          {r.candidateName || "—"}
                        </span>
                      </td>
                      <td className="admin-cell-mono u-right">
                        {r.aiRating != null ? `${r.aiRating.toFixed(1)}/5` : <span className="admin-cell-muted">—</span>}
                      </td>
                      <td>
                        {r.aiStatus ? (
                          <Badge tone={screenTone(r.aiStatus)}>{r.aiStatus}</Badge>
                        ) : (
                          <span className="admin-cell-muted">not scanned</span>
                        )}
                      </td>
                      <td>{r.stageName || <span className="admin-cell-muted">—</span>}</td>
                      <td>{r.screenedAt ? formatDate(r.screenedAt) : <span className="admin-cell-muted">—</span>}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="admin-btn admin-btn--sm"
                          onClick={() => rescan(r.id)}
                          disabled={isPending}
                        >
                          {busyId === r.id ? "Scanning…" : r.aiStatus === "done" ? "Re-scan" : "Scan"}
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={7} className="admin-td-inset">
                          {r.aiStatus === "failed" && r.aiError && (
                            <div className="u-py-3 u-err">
                              Scan failed: {r.aiError}
                            </div>
                          )}
                          {s ? (
                            <div className="u-stack u-gap-3 u-py-3 u-lg">
                              <div>
                                <div className="admin-label u-mb-1">Overview</div>
                                <div className="u-prewrap">{s.overview}</div>
                              </div>
                              <div>
                                <div className="admin-label u-mb-1">Skills</div>
                                <ul className="u-stack u-gap-1 u-m-0 u-pl-4">
                                  {s.skills.map((sk, j) => (
                                    <li key={j}>{sk}</li>
                                  ))}
                                </ul>
                              </div>
                              <div className="u-row u-wrap">
                                <span><span className="admin-label">English</span> {s.english}</span>
                                <span><span className="admin-label">Notice period</span> {s.notice_period}</span>
                              </div>
                              <div className="u-row">
                                {r.resumeDocumentId && (
                                  <a href={`/admin/talent/resume/${r.resumeDocumentId}`} target="_blank" rel="noreferrer">
                                    Resume ↗
                                  </a>
                                )}
                                {r.personId && <Link href={`/admin/talent/candidates/${r.personId}`}>Candidate profile →</Link>}
                              </div>
                            </div>
                          ) : (
                            r.aiStatus !== "failed" && (
                              <div className="admin-cell-muted u-py-3">
                                No screen result yet.
                              </div>
                            )
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

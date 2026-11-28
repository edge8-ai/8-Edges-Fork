"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate, humanize } from "@/kernel/ui/format";
import { appPath } from "@/kernel/config/slug";
import { AtsPerson, AtsRatings, AtsSectionHead } from "@/kernel/ui/talent";
import type { MayProp } from "@/kernel/identity/may-prop";
import { CloseReqPanel, type CloseOutcome } from "./CloseReq";
import { ClosedRoleNote, type ClosedRole } from "./ClosedRoleNote";
import { closeJobReq, reopenJobReq } from "./actions";
import type { JobReqRow } from "./JobReqsTable";
import { filledLine, salaryBand, seatsFilled, sortCandidates, standing } from "./roles";

/** One application, as its job's card lists it. */
export type RoleCandidate = {
  id: string;
  name: string | null;
  headline: string | null;
  stageName: string | null;
  status: string | null;
  rating: number | null;
  aiRating: number | null;
  appliedAt: string | null;
  archived: boolean;
};

// The funnel an open job's card shows, in the order the team Hiring page shows
// it. Rejected is counted after it, apart, so the list below adds up.
const FUNNEL = ["Screen", "Interview", "Offer", "Hired"];

// Each open job as a card, the way the team Hiring page draws one: the seats it
// fills, where its candidates stand, and what HR does with it, closing
// included. Open jobs are few and each one matters; the rest stay a table.
export function OpenRoleCards({
  rows,
  anyOpen = rows.length > 0,
  query = "",
  showArchived = false,
  onShowArchived,
  pastTitle = "Past jobs",
  onEdit,
  shows,
  may,
}: {
  /** The open jobs the search leaves. */
  rows: JobReqRow[];
  /** Whether any job is open at all, before the search. */
  anyOpen?: boolean;
  query?: string;
  showArchived?: boolean;
  /** Set only when some open job has archived candidates, since the box would change nothing otherwise. */
  onShowArchived?: (show: boolean) => void;
  /** What the table below is called, which is where a closed job goes. */
  pastTitle?: string;
  onEdit: (id: string) => void;
  /** Whether a candidate is listed, given the search and the archived box. */
  shows: (r: JobReqRow, c: RoleCandidate) => boolean;
  /** hiring.ats, which closing and reopening a job ask for (ADR 0014). */
  may: MayProp;
}) {
  // One card's close panel is open at a time, with the outcome it opened on.
  const [closing, setClosing] = useState<{ id: string; outcome: CloseOutcome | "" } | null>(null);
  // The job just closed. Its card has gone, so the note says where it went,
  // and it stays when that was the last open job.
  const [closed, setClosed] = useState<ClosedRole | null>(null);
  const canClose = may["hiring.ats"] === true;
  return (
    <>
      {closed && (
        <ClosedRoleNote
          key={closed.id}
          role={closed}
          pastTitle={pastTitle}
          reopen={() => reopenJobReq(closed.id)}
          onReopened={() => setClosed(null)}
        />
      )}
      <AtsSectionHead
        k="Hiring now"
        title="Open jobs"
        aside={
          anyOpen && onShowArchived ? (
            // Archived candidates only ever appear on these cards, so the box
            // that shows them sits here rather than in the page's top bar.
            <label className="ats-check">
              <input type="checkbox" checked={showArchived} onChange={(e) => onShowArchived(e.target.checked)} />
              Show archived candidates
            </label>
          ) : undefined
        }
      />
      {!anyOpen ? (
        <p className="admin-empty u-mb-4">No jobs are open right now.</p>
      ) : rows.length === 0 ? (
        <p className="admin-empty u-mb-4">No open job or candidate matches “{query}”.</p>
      ) : (
        <div className="ats-roles">
          {rows.map((r) => {
            const tags = [
              [r.location, r.remotePolicy ? humanize(r.remotePolicy) : null].filter(Boolean).join(" · ") || null,
              humanize(r.employmentType),
              r.companyName ? `Client: ${r.companyName}` : null,
              r.hiringManagerName ? `Hiring manager: ${r.hiringManagerName}` : "No hiring manager",
              salaryBand(r.salaryMinCents, r.salaryMaxCents, r.currency),
            ].filter((t): t is string => !!t);
            const extra = Object.keys(r.stageCounts).filter((n) => !FUNNEL.includes(n) && n !== "Rejected");
            const hired = r.stageCounts.Hired ?? 0;
            const rejected = r.stageCounts.Rejected ?? 0;
            const filled = seatsFilled(r);
            // The filled line carries the card's one primary button; without
            // it, the hiring board is the card's main way in.
            const nudge = canClose && filled;
            return (
              <section key={r.id} className="ats-role" aria-label={r.title || "Untitled job"}>
                <div className="ats-role-top">
                  <div>
                    <p className="ats-sec-k">{r.openedAt ? `Opened ${formatDate(r.openedAt)}` : "Open"}</p>
                    <h2 className="ats-role-h">
                      <Link href={`/admin/talent/jobs/${r.id}`}>{r.title || "(untitled job)"}</Link>
                    </h2>
                    <ul className="ats-chips">
                      {tags.map((t) => (
                        <li key={t} className="ats-chip ats-chip--calm">{t}</li>
                      ))}
                      {r.isPublic && <li><Badge tone="ok">Live on careers page</Badge></li>}
                    </ul>
                  </div>
                  {r.headcount != null && r.headcount > 0 && (
                    // Seats read as hired out of the seats to fill, so a filled
                    // job no longer says "1 to hire" about the one person hired.
                    <div className={filled ? "ats-seats is-filled" : "ats-seats"} aria-label={`${hired} of ${r.headcount} hired`}>
                      <b>{`${hired}/${r.headcount}`}</b>
                      <span>hired</span>
                    </div>
                  )}
                </div>
                <ol className="ats-stages" aria-label="Where the candidates are">
                  {[...FUNNEL, ...extra].map((name) => {
                    const n = r.stageCounts[name] ?? 0;
                    return (
                      <li key={name} className={n > 0 ? "ats-stage is-on" : "ats-stage"}>
                        <b>{n}</b>
                        {name}
                      </li>
                    );
                  })}
                  {rejected > 0 && (
                    <li className="ats-stage is-out">
                      <b>{rejected}</b>
                      Rejected
                    </li>
                  )}
                </ol>
                <RoleCandidates list={r.candidates.filter((c) => shows(r, c))} total={r.candidates.length} />
                {canClose && closing?.id === r.id ? (
                  <div className="ats-role-close">
                    <CloseReqPanel
                      close={(outcome) => closeJobReq(r.id, outcome)}
                      initialOutcome={closing.outcome}
                      compact
                      onCancel={() => setClosing(null)}
                      onClosed={(outcome) => {
                        setClosing(null);
                        setClosed({ id: r.id, title: r.title, outcome, wasLive: r.isPublic });
                      }}
                    />
                  </div>
                ) : (
                  <>
                    {nudge && (
                      <div className="admin-alert admin-alert--info ats-note ats-role-note">
                        <span>{filledLine(r)}</span>
                        <button
                          type="button"
                          className="admin-btn admin-btn--sm admin-btn--primary"
                          onClick={() => setClosing({ id: r.id, outcome: "filled" })}
                        >
                          Close as filled…
                        </button>
                      </div>
                    )}
                    <div className="ats-role-actions">
                      <Link
                        href={`/admin/talent/jobs/${r.id}`}
                        className={nudge ? "admin-btn admin-btn--sm" : "admin-btn admin-btn--primary admin-btn--sm"}
                      >
                        Open hiring board
                      </Link>
                      <button type="button" className="admin-btn admin-btn--sm" aria-haspopup="dialog" onClick={() => onEdit(r.id)}>
                        Edit details
                      </button>
                      <Link href={`/admin/talent/applications/new?req=${r.id}`} className="admin-btn admin-btn--sm">
                        Add candidate
                      </Link>
                      {canClose && (
                        <button type="button" className="admin-btn admin-btn--sm u-ml-auto" onClick={() => setClosing({ id: r.id, outcome: "" })}>
                          Close job…
                        </button>
                      )}
                    </div>
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

// The job's applications, furthest along first: the hire at the top, the people
// out of the running at the bottom in grey. Each row opens the application,
// which is where a candidate is advanced, rejected and rated.
function RoleCandidates({ list, total }: { list: RoleCandidate[]; total: number }) {
  if (total === 0) return <p className="admin-empty">No one has applied to this job yet.</p>;
  if (list.length === 0) return <p className="admin-empty">No candidate here matches.</p>;
  return (
    <>
      <p className="ats-sec-k ats-cands-k">Candidates · {list.length}</p>
      <ul className="ats-cands">
        {sortCandidates(list).map((c) => {
          const s = standing(c);
          return (
            <li key={c.id} className={s.out ? "is-out" : undefined}>
              <Link href={appPath(c.name, c.id)} className="ats-cand">
                <AtsPerson name={c.name} meta={[c.appliedAt ? `Applied ${formatDate(c.appliedAt)}` : null, c.headline].filter(Boolean).join(" · ")} />
                <span className="ats-cand-status">
                  {c.archived && <Badge tone="neutral">Archived</Badge>}
                  <Badge tone={s.tone}>{s.label}</Badge>
                </span>
                <AtsRatings ai={c.aiRating} hr={c.rating} />
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

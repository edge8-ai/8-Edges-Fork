"use client";

import Link from "next/link";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { formatCents, formatDate, humanize } from "@/kernel/ui/format";
import { appPath } from "@/kernel/config/slug";
import { AtsPerson, AtsRatings } from "@/kernel/ui/talent";
import type { JobReqRow } from "./JobReqsTable";

/** One application, as its role's card lists it. */
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

// The funnel an open role's card shows, in the order the team Hiring page
// shows it. Rejected is left out: the card is about who is still in flight.
const FUNNEL = ["Screen", "Interview", "Offer", "Hired"];

export function salaryBand(min: number | null, max: number | null, cur: string) {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `${formatCents(min, cur)} – ${formatCents(max, cur)}`;
  return formatCents(min ?? max, cur);
}

// Each open role as a card, the way the team Hiring page draws one: the seats
// it fills, where its candidates stand, and the two things a recruiter does
// with it. Open reqs are few and each one matters; the rest stay a table.
export function OpenRoleCards({
  rows,
  onEdit,
  shows,
}: {
  rows: JobReqRow[];
  onEdit: (id: string) => void;
  /** Whether a candidate is listed, given the search and the archived toggle. */
  shows: (r: JobReqRow, c: RoleCandidate) => boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="ats-roles">
      {rows.map((r) => {
        const tags = [
          [r.location, r.remotePolicy ? humanize(r.remotePolicy) : null].filter(Boolean).join(" · ") || null,
          humanize(r.employmentType),
          r.hiringManagerName ? `Hiring manager: ${r.hiringManagerName}` : "No hiring manager",
          salaryBand(r.salaryMinCents, r.salaryMaxCents, r.currency),
        ].filter((t): t is string => !!t);
        const extra = Object.keys(r.stageCounts).filter((n) => !FUNNEL.includes(n) && n !== "Rejected");
        return (
          <section key={r.id} className="ats-role" aria-label={r.title || "Untitled req"}>
            <div className="ats-role-top">
              <div>
                <p className="ats-sec-k">Open role{r.openedAt ? ` · opened ${formatDate(r.openedAt)}` : ""}</p>
                <h2 className="ats-role-h">
                  <Link href={`/admin/talent/jobs/${r.id}`}>{r.title || "(untitled req)"}</Link>
                </h2>
                <ul className="ats-chips">
                  {tags.map((t) => (
                    <li key={t} className="ats-chip ats-chip--calm">{t}</li>
                  ))}
                  {r.isPublic && <li><Badge tone="ok">Live on the careers page</Badge></li>}
                </ul>
              </div>
              {r.headcount != null && (
                <div className="ats-seats" aria-label={`${r.headcount} to hire`}>
                  <b>{r.headcount}</b>
                  <span>to hire</span>
                </div>
              )}
            </div>
            <ol className="ats-stages" aria-label="Where the candidates in flight are">
              {[...FUNNEL, ...extra].map((name) => {
                const n = r.stageCounts[name] ?? 0;
                return (
                  <li key={name} className={n > 0 ? "ats-stage is-on" : "ats-stage"}>
                    <b>{n}</b>
                    {name}
                  </li>
                );
              })}
            </ol>
            <RoleCandidates list={r.candidates.filter((c) => shows(r, c))} total={r.candidates.length} />
            <div className="ats-role-actions">
              <Link href={`/admin/talent/jobs/${r.id}`} className="admin-btn admin-btn--primary admin-btn--sm">
                Open hiring board
              </Link>
              <button type="button" className="admin-btn admin-btn--sm" aria-haspopup="dialog" onClick={() => onEdit(r.id)}>
                Edit req
              </button>
              <Link href={`/admin/talent/applications/new?req=${r.id}`} className="admin-btn admin-btn--sm">
                Add candidates
              </Link>
            </div>
          </section>
        );
      })}
    </div>
  );
}

// The role's applications, best AI screen first. Each row opens the application,
// which is where a candidate is advanced, rejected and rated.
function RoleCandidates({ list, total }: { list: RoleCandidate[]; total: number }) {
  if (total === 0) return <p className="admin-empty">No one has applied to this role yet.</p>;
  if (list.length === 0) return <p className="admin-empty">No candidate here matches.</p>;
  const sorted = [...list].sort((a, b) => (b.aiRating ?? -1) - (a.aiRating ?? -1));
  return (
    <>
      <p className="ats-sec-k ats-cands-k">Candidates</p>
      <ul className="ats-cands">
        {sorted.map((c) => (
          <li key={c.id}>
            <Link href={appPath(c.name, c.id)} className="ats-cand">
              <AtsPerson name={c.name} meta={[c.stageName, c.appliedAt ? `applied ${formatDate(c.appliedAt)}` : null, c.headline].filter(Boolean).join(" · ")} />
              <span className="ats-cand-status">
                {c.archived && <Badge tone="neutral">Archived</Badge>}
                {c.status && c.status !== "active" && <Badge tone={statusTone(c.status)}>{humanize(c.status)}</Badge>}
              </span>
              <AtsRatings ai={c.aiRating} hr={c.rating} />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

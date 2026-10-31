import type { ReactNode } from "react";
import { initials } from "@/kernel/ui/format";
import { dateMs, saigonToday } from "@/kernel/config/dates";
import { employmentTypeLabel } from "@/entities/hiring";
import type { HiringReq, HiringGridRow } from "@/entities/team/lib/hiring";
import { GridCellNode, InterviewOutcomeChip, fmtDay } from "./hiring-chips";

// One open role on the Hiring page (TH.18): the seats it fills, where its
// in-flight candidates are, the loop it runs, and each candidate with their
// chips. The verbs (CandidateActions) come from the page, because a card is
// read-only for anyone who is not the role's hiring manager or an admin.

const STAGES = ["New", "Screen", "Interview", "Offer"] as const;

/** Which of the four columns a stage counts under: its name decides, and anything earlier than a screen is new. */
function stageColumn(name: string | null): (typeof STAGES)[number] {
  const n = (name ?? "").toLowerCase();
  if (n.includes("offer")) return "Offer";
  if (n.includes("interview")) return "Interview";
  if (n.includes("screen")) return "Screen";
  return "New";
}

function Seats({ n }: { n: number | null }) {
  if (!n) return null;
  return (
    <div className="hr-seats" aria-label={`${n} to hire`}>
      <span className="hr-seats-n">{n}</span>
      <span className="hr-seats-l">to hire</span>
    </div>
  );
}

function Person({ req, row, actions }: { req: HiringReq; row: HiringGridRow; actions: ReactNode }) {
  const sub = [row.rating != null ? `AI screen ${row.rating}` : null, row.stageName].filter(Boolean).join(" · ");
  return (
    <li className="hr-person">
      <span className="hr-av" aria-hidden="true">
        {initials(row.name)}
      </span>
      <div className="u-min-0">
        <p className="hr-person-n">{row.name}</p>
        {sub && <p className="hr-meta">{sub}</p>}
      </div>
      <div className="hr-steps">
        {req.loop.length > 0
          ? row.cells.map((cell, i) => <GridCellNode key={req.loop[i].id} cell={cell} step={req.loop[i].name} />)
          : row.interviews.length === 0
            ? <span className="hr-chip">No interviews yet</span>
            : row.interviews.map((iv) => <InterviewOutcomeChip key={iv.interviewId} iv={iv} />)}
      </div>
      {actions && <div className="hr-person-acts">{actions}</div>}
    </li>
  );
}

export function RoleCard({ req, actionsFor }: { req: HiringReq; actionsFor: ((row: HiringGridRow) => ReactNode) | null }) {
  const counts = new Map<string, number>(STAGES.map((s) => [s, 0]));
  for (const row of req.grid) counts.set(stageColumn(row.stageName), (counts.get(stageColumn(row.stageName)) ?? 0) + 1);
  const days = req.openedAt ? Math.max(0, Math.round((dateMs(saigonToday()) - dateMs(req.openedAt.slice(0, 10))) / 86_400_000)) : null;
  const tags = [
    req.location,
    employmentTypeLabel(req.employmentType),
    req.hiringManagerName ? `Hiring manager: ${req.hiringManagerIsMe ? "you" : req.hiringManagerName}` : null,
  ].filter((t): t is string => !!t);

  return (
    <section className="hr-card hr-sec hr-role" aria-label={req.title}>
      <div className="hr-role-top">
        <div className="u-min-0">
          <p className="hr-sec-k">Open role{req.openedAt ? ` · opened ${fmtDay(req.openedAt)}` : ""}</p>
          <h2 className="hr-role-h">{req.title}</h2>
          {tags.length > 0 && (
            <p className="hr-tags">
              {tags.map((t) => (
                <span key={t} className="hr-tag">
                  {t}
                </span>
              ))}
            </p>
          )}
        </div>
        <Seats n={req.headcount} />
      </div>

      <ol className="hr-funnel" aria-label="Where the candidates in flight are">
        {STAGES.map((s) => (
          <li key={s} className={(counts.get(s) ?? 0) > 0 ? "hr-stage is-on" : "hr-stage"}>
            <span className="hr-stage-n">{counts.get(s)}</span>
            <span className="hr-stage-l">{s}</span>
          </li>
        ))}
      </ol>

      {req.loop.length > 0 ? (
        <>
          <p className="hr-sub-k">Interview loop</p>
          <ol className="hr-loop">
            {req.loop.map((step, i) => (
              <li key={step.id}>
                <span className="hr-loop-n">{i + 1}</span>
                <div className="u-min-0">
                  <b>{step.name}</b>
                  <span className="hr-meta">
                    {[step.durationMinutes != null ? `${step.durationMinutes} min` : null, step.interviewers.length ? step.interviewers.map((p) => p.name).join(", ") : "No interviewer assigned"]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="hr-note">No interview loop is set for this role yet. Once Talent sets one, each candidate shows where they are in it.</p>
      )}

      <div className="hr-sub-row">
        <p className="hr-sub-k">In flight</p>
        {req.loop.length > 0 && req.unassignedCount > 0 && (
          <span className="hr-meta">
            {req.unassignedCount} interview{req.unassignedCount === 1 ? "" : "s"} not matched to a loop step
          </span>
        )}
      </div>
      {req.candidates.length === 0 ? (
        <div className="hr-empty">
          <span className="hr-empty-ico" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="8" r="3.5" />
              <path d="M3 20a6 6 0 0 1 12 0" />
              <path d="M18 8v6 M15 11h6" />
            </svg>
          </span>
          <div>
            <p className="hr-empty-t">Nobody has applied yet</p>
            <p className="hr-meta">
              {days != null ? `Open ${days === 1 ? "1 day" : `${days} days`}. ` : ""}When someone applies, they show here with their AI screen and where they stand in the loop.
            </p>
          </div>
        </div>
      ) : req.grid.length === 0 ? (
        <p className="hr-note">Nobody is in flight. Every applicant is at a closed stage.</p>
      ) : (
        <ul className="hr-people">
          {req.grid.map((row) => (
            <Person key={row.applicationId} req={req} row={row} actions={actionsFor ? actionsFor(row) : null} />
          ))}
        </ul>
      )}
    </section>
  );
}

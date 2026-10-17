import { requirePermission } from "@/kernel/identity/access-request";
import type { ReactNode } from "react";
import Link from "next/link";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { PageHead } from "@/kernel/ui/PageHead";
import {
  getTeamHiring,
  getMyInterviewDay,
  type MyInterviewState,
  type GridCell,
  type CandidateInterview,
} from "@/entities/team/lib/hiring";
import { CandidateActions } from "./CandidateActions";
import { RECOMMENDATIONS } from "@/entities/hiring";

export const metadata = { title: "Hiring" };

// Booked times render in Saigon: everyone reading this page is on that clock.
function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Time only, for the day strip where the date is a given.
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmt(iso: string | null): string {
  if (!iso) return "-";
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// State to chip: colour and label for a booked interview on the day strip.
const INTERVIEW_STATE_CHIP: Record<MyInterviewState, { className: string; label: string }> = {
  up_next: { className: "admin-badge admin-badge--info", label: "Up next" },
  in_progress: { className: "admin-badge admin-badge--info admin-badge--dot", label: "In progress" },
  scorecard_due: { className: "admin-badge admin-badge--warn", label: "Scorecard due" },
  done: { className: "admin-badge admin-badge--ok", label: "Scored" },
};

// Day-slot left-rail colour per state (see .admin-hire-slot--* in admin.css).
const SLOT_MODIFIER: Record<MyInterviewState, string> = {
  up_next: "next",
  in_progress: "now",
  scorecard_due: "due",
  done: "done",
};

// How a closed role's outcome reads in the Closed roles section.
const CLOSED_OUTCOME: Record<string, { className: string; label: string }> = {
  filled: { className: "admin-badge admin-badge--ok", label: "Filled" },
  closed: { className: "admin-badge", label: "Closed" },
  cancelled: { className: "admin-badge admin-badge--err", label: "Cancelled" },
};

// One interview's outcome, as a chip: the round, how the human panel came down
// (advance / hold / reject, or Split when they disagree) and the average score,
// linking to the kit. This is how logged feedback shows on the in-flight list
// for roles with no loop template, so nothing a manager wrote is hidden.
const REC_META = new Map(RECOMMENDATIONS.map((r) => [r.key, r]));
const REC_TONE_CLASS: Record<string, string> = {
  ok: "admin-badge--ok",
  warn: "admin-badge--warn",
  err: "admin-badge--err",
};

function InterviewOutcomeChip({ iv }: { iv: CandidateInterview }) {
  const future = iv.scheduledAt != null && new Date(iv.scheduledAt).getTime() > Date.now();
  let className = "admin-badge admin-badge--info";
  let text = iv.label;

  if (future) {
    text = `${iv.label} · booked`;
  } else if (!iv.revealed) {
    // Viewer sits on this round and has not scored it; the outcome stays blind.
    className = "admin-badge admin-badge--warn admin-badge--dot";
    text = `${iv.label} · score it`;
  } else if (iv.humanSeats > 0 && iv.submitted < iv.humanSeats) {
    className = "admin-badge admin-badge--warn";
    text = `${iv.label} · ${iv.submitted}/${iv.humanSeats} scored`;
  } else if (iv.submitted > 0) {
    const unique = Array.from(new Set(iv.recommendations));
    if (unique.length === 1) {
      const meta = REC_META.get(unique[0]);
      className = `admin-badge ${REC_TONE_CLASS[meta?.tone ?? ""] ?? "admin-badge--info"}`;
      text = `${iv.label} · ${meta?.label ?? "Scored"}`;
    } else if (unique.length > 1) {
      text = `${iv.label} · Split`;
    } else {
      className = "admin-badge admin-badge--ok";
      text = `${iv.label} · Scored`;
    }
    if (iv.avgScore != null) text += ` ${iv.avgScore}`;
  }

  return (
    <Link href={`/team/hiring/${iv.interviewId}`} className="u-link-plain">
      <span className={className}>{text}</span>
    </Link>
  );
}

// One grid cell: where a candidate stands on one loop step. When the cell is
// backed by a real interview, the chip links to that interview's kit.
function GridCellNode({ cell }: { cell: GridCell }) {
  let inner: ReactNode;
  switch (cell.status) {
    case "done":
      inner = <span className="admin-badge admin-badge--ok">Done</span>;
      break;
    case "pending":
      inner = (
        <span className="admin-badge admin-badge--warn" title={`${cell.label} human scorecards in`}>
          {cell.label}
        </span>
      );
      break;
    case "booked":
      inner = <span className="admin-badge admin-badge--info">{cell.label}</span>;
      break;
    case "action":
      inner = <span className="admin-badge admin-badge--err">Nothing booked</span>;
      break;
    case "open":
      inner = <span className="admin-cell-muted">Not booked</span>;
      break;
    default:
      inner = <span className="admin-cell-muted">-</span>;
  }
  if (cell.interviewId) {
    return (
      <Link href={`/team/hiring/${cell.interviewId}`} className="u-link-plain">
        {inner}
      </Link>
    );
  }
  return inner;
}

// /team/hiring, hiring managers only. A hiring manager is someone who owns at
// least one requisition (or an admin); org "manager" role and interview-panel
// seats do not grant access. Read-only: open reqs, who is in flight, the loop
// each role runs, and where this manager sits. Written from /admin/talent.
export default async function TeamHiringPage() {
  // team.hiring is held by hiring managers, admins included (ADR 0013).
  await requirePermission("team.hiring");
  const actor = await requireTeamMember();

  const [{ reqs, closedReqs, mySlots }, myDay] = await Promise.all([
    getTeamHiring(actor),
    getMyInterviewDay(actor),
  ]);
  const totalActive = reqs.reduce((n, r) => n + r.activeCount, 0);
  const dueCount = myDay.filter((i) => i.state === "scorecard_due").length;

  return (
    <>
      <PageHead
        eyebrow="My Team"
        title="Hiring"
        sub={
          reqs.length === 0
            ? "No open roles"
            : `${reqs.length} open ${reqs.length === 1 ? "role" : "roles"} · ${totalActive} in flight` +
              (myDay.length > 0 ? ` · ${myDay.length} interview${myDay.length === 1 ? "" : "s"} for you` : "")
        }
      />

      <div className="u-stack u-gap-4">
        {myDay.length > 0 && (
          <section className="admin-card admin-coach-section">
            <div className="admin-card-title">
              Your interviews{" "}
              {dueCount > 0 && (
                <span className="admin-badge admin-badge--warn">
                  {dueCount} scorecard{dueCount === 1 ? "" : "s"} due
                </span>
              )}
            </div>
            <div className="admin-hint">Today, just completed, and anything still waiting on your scorecard.</div>
            <div className="u-mt-3">
              {myDay.map((iv) => {
                const chip = INTERVIEW_STATE_CHIP[iv.state];
                return (
                  <div key={iv.interviewId} className={`admin-hire-slot admin-hire-slot--${SLOT_MODIFIER[iv.state]}`}>
                    <span className="admin-hire-slot-time">{fmtTime(iv.scheduledAt)}</span>
                    <div className="admin-hire-slot-body">
                      <div className="admin-hire-slot-head">
                        <span className="admin-hire-slot-name">{iv.candidateName}</span>
                        <span className={chip.className}>{chip.label}</span>
                      </div>
                      <div className="admin-hire-slot-meta">
                        {[
                          iv.stepName,
                          iv.reqTitle,
                          iv.durationMinutes != null ? `${iv.durationMinutes} min` : null,
                          iv.mode,
                          iv.isToday ? null : `was ${fmtWhen(iv.scheduledAt)}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                    <Link href={`/team/hiring/${iv.interviewId}`} className="admin-btn admin-btn--sm admin-hire-slot-cta">
                      {iv.state === "scorecard_due" || iv.state === "in_progress" ? "Submit scorecard" : "Open kit"}
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {mySlots.length > 0 && (
          <section className="admin-card admin-coach-section">
            <div className="admin-card-title">Your loops</div>
            <div className="admin-hint">
              The loops you are named in. Times appear here once the interview is booked.
            </div>
            {mySlots.map((s) => (
              <div key={`${s.reqId}-${s.stepName}-${s.position}`} className="admin-loop-step admin-loop-step--read">
                <span className="admin-loop-step-num">{s.position}</span>
                <div className="admin-loop-step-body">
                  <div className="admin-loop-step-head">
                    <strong>{s.stepName}</strong>
                    <span className="admin-cell-muted">
                      {s.reqTitle}
                      {s.durationMinutes != null ? ` · ${s.durationMinutes} min` : ""}
                    </span>
                  </div>
                  {s.booked.length > 0 ? (
                    <div className="admin-loop-step-booked">
                      {s.booked.map((b) => (
                        <div key={b.interviewId}>
                          <strong>{fmtWhen(b.scheduledAt)}</strong> with {b.candidateName}
                          {b.mode ? ` · ${b.mode}` : ""}
                          {b.status && b.status !== "scheduled" ? ` · ${b.status}` : ""}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="admin-cell-muted u-sm">
                      {s.waiting === 0
                        ? "Nobody at the interview stage yet"
                        : `${s.waiting} candidate${s.waiting === 1 ? "" : "s"} at the interview stage, nothing booked`}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </section>
        )}

        {reqs.length === 0 && (
          <section className="admin-card admin-coach-section">
            <div className="admin-empty">
              No open roles right now.
            </div>
          </section>
        )}

        {reqs.map((req) => {
          // The req's hiring manager (or an admin in the team view) gets the
          // verbs. Everyone else sees the grid read-only.
          const canManage = req.hiringManagerIsMe || actor.isAdmin;
          return (
          <section key={req.id} className="admin-card admin-coach-section">
            <div className="admin-card-title">
              {req.title}{" "}
              <span className="admin-cell-muted">
                ({req.activeCount} in flight
                {req.headcount ? ` · ${req.headcount} to hire` : ""})
              </span>
            </div>
            <div className="admin-hint">
              {[
                req.hiringManagerName
                  ? `Hiring manager: ${req.hiringManagerIsMe ? "you" : req.hiringManagerName}`
                  : null,
                req.location,
                req.employmentType,
                req.openedAt ? `opened ${fmt(req.openedAt)}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>

            {req.loop.length > 0 && (
              <>
                <div className="admin-label u-mt-4">
                  Interview loop
                </div>
                {req.loop.map((step, i) => (
                  <div key={step.id} className="admin-loop-step admin-loop-step--read">
                    <span className="admin-loop-step-num">{i + 1}</span>
                    <div className="admin-loop-step-body">
                      <div className="admin-loop-step-head">
                        <strong>{step.name}</strong>
                        {step.durationMinutes != null && (
                          <span className="admin-cell-muted">{step.durationMinutes} min</span>
                        )}
                      </div>
                      <div className="admin-loop-step-people">
                        {step.interviewers.length === 0 ? (
                          <span className="admin-cell-muted">No interviewer assigned</span>
                        ) : (
                          step.interviewers.map((iv) => (
                            <span key={iv.personId} className="admin-badge">
                              {iv.name}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}

            <div className="admin-label-row u-mt-4">
              <span className="admin-label">In flight</span>
              {req.loop.length > 0 && req.unassignedCount > 0 && (
                <span className="admin-hint">
                  {req.unassignedCount} interview{req.unassignedCount === 1 ? "" : "s"} not matched to a loop step
                </span>
              )}
            </div>
            {req.candidates.length === 0 ? (
              <div className="admin-empty">Nobody has applied yet.</div>
            ) : req.grid.length === 0 ? (
              <div className="admin-empty">No candidates in flight. All applicants are at a closed stage.</div>
            ) : req.loop.length === 0 ? (
              <div className="admin-table-scroll">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Candidate</th>
                      <th>Stage</th>
                      <th>Interviews</th>
                      {canManage && <th className="u-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {req.grid.map((row) => (
                      <tr key={row.applicationId}>
                        <td>
                          <div>{row.name}</div>
                          {row.rating != null && (
                            <div className="admin-cell-muted u-sm">
                              AI screen {row.rating}
                            </div>
                          )}
                        </td>
                        <td>{row.stageName ?? "-"}</td>
                        <td>
                          {row.interviews.length === 0 ? (
                            <span className="admin-cell-muted">No interviews yet</span>
                          ) : (
                            <div className="u-row u-wrap">
                              {row.interviews.map((iv) => (
                                <InterviewOutcomeChip key={iv.interviewId} iv={iv} />
                              ))}
                            </div>
                          )}
                        </td>
                        {canManage && (
                          <td className="u-right">
                            <CandidateActions
                              applicationId={row.applicationId}
                              canRequestBooking={row.atInterview && row.interviews.length === 0}
                              bookingRequested={Boolean(row.bookingRequestedAt)}
                            />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="admin-table-scroll">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Candidate</th>
                      {req.loop.map((step, i) => (
                        <th key={step.id}>
                          {i + 1}. {step.name}
                        </th>
                      ))}
                      {canManage && <th className="u-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {req.grid.map((row) => (
                      <tr key={row.applicationId}>
                        <td>
                          <div>{row.name}</div>
                          <div className="admin-cell-muted u-sm">
                            {row.rating != null ? `AI screen ${row.rating}` : row.stageName ?? "-"}
                          </div>
                        </td>
                        {row.cells.map((cell, i) => (
                          <td key={req.loop[i].id}>
                            <GridCellNode cell={cell} />
                          </td>
                        ))}
                        {canManage && (
                          <td className="u-right">
                            <CandidateActions
                              applicationId={row.applicationId}
                              canRequestBooking={row.cells.some((c) => c.status === "action")}
                              bookingRequested={Boolean(row.bookingRequestedAt)}
                            />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          );
        })}

        {closedReqs.length > 0 && (
          <details className="admin-card admin-coach-section">
            <summary className="u-list-revert">
              <span className="admin-card-title u-inline">
                Closed roles
              </span>{" "}
              <span className="admin-cell-muted">({closedReqs.length})</span>
            </summary>
            <div className="u-stack u-gap-5 u-mt-4">
              {closedReqs.map((req) => {
                const outcome = CLOSED_OUTCOME[req.status] ?? { className: "admin-badge", label: req.status };
                return (
                  <div key={req.id}>
                    <div className="u-row u-wrap">
                      <strong>{req.title}</strong>
                      <span className={outcome.className}>{outcome.label}</span>
                      {req.closedAt && (
                        <span className="admin-cell-muted u-sm">
                          closed {fmt(req.closedAt)}
                        </span>
                      )}
                    </div>
                    {req.grid.length === 0 ? (
                      <div className="admin-hint u-mt-2">
                        No candidates recorded.
                      </div>
                    ) : (
                      <div className="admin-table-scroll u-mt-2">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Candidate</th>
                              <th>Stage</th>
                              <th>Interviews</th>
                            </tr>
                          </thead>
                          <tbody>
                            {req.grid.map((row) => (
                              <tr key={row.applicationId}>
                                <td>
                                  <div>{row.name}</div>
                                  {row.rating != null && (
                                    <div className="admin-cell-muted u-sm">
                                      AI screen {row.rating}
                                    </div>
                                  )}
                                </td>
                                <td>{row.stageName ?? "-"}</td>
                                <td>
                                  {row.interviews.length === 0 ? (
                                    <span className="admin-cell-muted">No interviews</span>
                                  ) : (
                                    <div className="u-row u-wrap">
                                      {row.interviews.map((iv) => (
                                        <InterviewOutcomeChip key={iv.interviewId} iv={iv} />
                                      ))}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
        )}
      </div>
    </>
  );
}

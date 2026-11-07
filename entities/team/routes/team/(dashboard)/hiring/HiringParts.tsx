import Link from "next/link";
import type { MyInterview, TeamHiring } from "@/entities/team/lib/hiring";
import { CLOSED_OUTCOME, INTERVIEW_STATE_CHIP, InterviewOutcomeChip, fmtTime, fmtWhen } from "./hiring-chips";
import { ClosedRoleToggle } from "./ClosedRoleToggle";

// The Hiring page's other parts (TH.18): the reader's own interviews, the loops
// they sit in, the closed roles by month, and how hiring runs here.

export function YourInterviews({ myDay }: { myDay: MyInterview[] }) {
  const due = myDay.filter((i) => i.state === "scorecard_due").length;
  return (
    <section className="hr-card hr-sec" aria-labelledby="hr-iv-h">
      <div className="hr-sec-head">
        <div>
          <p className="hr-sec-k">Waiting on you</p>
          <h2 className="hr-sec-h" id="hr-iv-h">
            Your interviews
          </h2>
        </div>
        {due > 0 && <span className="hr-pill">{due === 1 ? "1 scorecard due" : `${due} scorecards due`}</span>}
      </div>
      {myDay.map((iv) => {
        const chip = INTERVIEW_STATE_CHIP[iv.state];
        return (
          <div key={iv.interviewId} className="hr-slot">
            <span className="hr-slot-time">
              <b>{fmtTime(iv.scheduledAt)}</b>
              <small>{iv.isToday ? "Today" : fmtWhen(iv.scheduledAt).split(",")[0]}</small>
            </span>
            <div className="u-min-0">
              <p className="hr-slot-who">
                {iv.candidateName} <span className={chip.className}>{chip.label}</span>
              </p>
              <p className="hr-meta">
                {[iv.stepName, iv.reqTitle, iv.durationMinutes != null ? `${iv.durationMinutes} min` : null, iv.mode].filter(Boolean).join(" · ")}
              </p>
            </div>
            <Link href={`/team/hiring/${iv.interviewId}`} className="hr-btn">
              {iv.state === "scorecard_due" || iv.state === "in_progress" ? "Submit scorecard" : "Open kit"}
            </Link>
          </div>
        );
      })}
    </section>
  );
}

export function YourLoops({ slots }: { slots: TeamHiring["mySlots"] }) {
  return (
    <section className="hr-card" aria-labelledby="hr-loops-h">
      <p className="hr-sec-k" id="hr-loops-h">
        Your loops
      </p>
      <ul className="hr-myloops">
        {slots.map((s) => (
          <li key={`${s.reqId}-${s.stepName}-${s.position}`}>
            <b>
              {s.position}. {s.stepName}
            </b>
            <span className="hr-meta">
              {s.reqTitle}
              {s.durationMinutes != null ? ` · ${s.durationMinutes} min` : ""}
            </span>
            {s.booked.length > 0 ? (
              s.booked.map((b) => (
                <span key={b.interviewId} className="hr-meta">
                  {fmtWhen(b.scheduledAt)} with {b.candidateName}
                  {b.mode ? ` · ${b.mode}` : ""}
                  {b.status && b.status !== "scheduled" ? ` · ${b.status}` : ""}
                </span>
              ))
            ) : (
              <span className="hr-meta">
                {s.waiting === 0 ? "Nobody at the interview stage yet" : `${s.waiting} at the interview stage, nothing booked`}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function monthOf(iso: string | null): string {
  if (!iso) return "Closed";
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function ClosedRoles({ reqs }: { reqs: TeamHiring["closedReqs"] }) {
  const filled = reqs.filter((r) => r.status === "filled").length;
  // Newest first already; grouped by the month each role closed, every role listed.
  const groups: { label: string; reqs: typeof reqs }[] = [];
  for (const r of reqs) {
    const label = monthOf(r.closedAt);
    const g = groups.find((x) => x.label === label);
    if (g) g.reqs.push(r);
    else groups.push({ label, reqs: [r] });
  }
  return (
    <section className="hr-card hr-sec" aria-labelledby="hr-closed-h">
      <div className="hr-sec-head">
        <div>
          <p className="hr-sec-k">Done</p>
          <h2 className="hr-sec-h" id="hr-closed-h">
            Closed roles
          </h2>
        </div>
        <span className="hr-pill hr-pill-calm">
          {reqs.length === 1 ? "1 role" : `${reqs.length} roles`} · {filled} filled
        </span>
      </div>
      {groups.map((g) => (
        <div key={g.label}>
          <p className="hr-month">{g.label}</p>
          <ul className="hr-closed">
            {g.reqs.map((r) => {
              const outcome = CLOSED_OUTCOME[r.status] ?? { className: "hr-chip", label: r.status };
              const n = r.grid.length;
              const meta = `${n === 1 ? "1 candidate" : `${n} candidates`}${r.closedAt ? ` · closed ${new Date(`${r.closedAt.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}` : ""}`;
              return (
                <ClosedRoleToggle key={r.id} title={r.title} meta={meta} outcome={outcome} hasCandidates={n > 0}>
                  <ul className="hr-closed-people">
                    {r.grid.map((row) => (
                      <li key={row.applicationId}>
                        <span className="u-min-0">
                          <b>{row.name}</b>
                          <span className="hr-meta">{[row.stageName, row.rating != null ? `AI screen ${row.rating}` : null].filter(Boolean).join(" · ")}</span>
                        </span>
                        <span className="hr-steps">
                          {row.interviews.map((iv) => (
                            <InterviewOutcomeChip key={iv.interviewId} iv={iv} />
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </ClosedRoleToggle>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

export function HowHiringWorks() {
  return (
    <section className="hr-card" aria-labelledby="hr-how-h">
      <p className="hr-sec-k">How it works</p>
      <h2 className="hr-sec-h" id="hr-how-h">
        From applying to hired
      </h2>
      <ol className="hr-how">
        <li>
          <div>
            <b>They apply</b>
            <span>Applications get an AI screen, with a score you can read beside each name.</span>
          </div>
        </li>
        <li>
          <div>
            <b>The loop runs</b>
            <span>Each step of the interview loop is booked with its interviewers.</span>
          </div>
        </li>
        <li>
          <div>
            <b>Scorecards stay blind</b>
            <span>You see how a round went only after you score it yourself.</span>
          </div>
        </li>
        <li>
          <div>
            <b>An offer, then hired</b>
            <span>Talent makes the offer. Once hired, they move to Onboarding.</span>
          </div>
        </li>
      </ol>
    </section>
  );
}

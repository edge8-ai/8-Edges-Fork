import Link from "next/link";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate, humanize } from "@/kernel/ui/format";
import { AtsPerson, AtsSectionHead } from "@/kernel/ui/talent";
import type { Day8Results, ProbationExit } from "@/entities/onboarding/lib/outcomes";

// The three sections the Onboarding screen adds under the board: probation
// decisions that are due, what new hires said on Day 8, and who left before
// probation ended. The page passes each only what its reader may see: the
// readers in lib/outcomes.ts leave names, reasons and written answers out for
// someone without the team's records, so nothing here has them to show.

export type DecisionDue = {
  teamMemberId: string;
  name: string;
  position: string | null;
  managerName: string | null;
  endsOn: string | null;
  daysLeft: number | null;
  /** A decision already recorded on the onboarding record, if any. */
  decision: string | null;
  day8Answered: boolean;
  day8Score: number | null;
};

// How soon a decision reads as due: the window managers are nudged in.
const DUE_WINDOW_DAYS = 14;

function dueBadge(d: DecisionDue) {
  if (d.decision) return <Badge tone={d.decision === "terminate" ? "err" : "ok"}>{humanize(d.decision)} recorded</Badge>;
  if (d.daysLeft === null) return <Badge tone="neutral">No end date</Badge>;
  const on = d.endsOn ? formatDate(d.endsOn) : "";
  if (d.daysLeft < 0) return <Badge tone="err">Overdue by {Math.abs(d.daysLeft)} days</Badge>;
  return <Badge tone={d.daysLeft <= DUE_WINDOW_DAYS ? "warn" : "neutral"}>Due {on}, in {d.daysLeft} day{d.daysLeft === 1 ? "" : "s"}</Badge>;
}

/** Everyone on probation, soonest decision first: what the Probation screen used to list. */
export function DecisionsDue({ rows }: { rows: DecisionDue[] }) {
  const due = rows.filter((r) => !r.decision && r.daysLeft !== null && r.daysLeft <= DUE_WINDOW_DAYS).length;
  return (
    <section className="admin-card admin-section-card" aria-label="Probation decisions">
      <AtsSectionHead
        k="Waiting on a decision"
        title="Probation decisions"
        aside={due > 0 ? <Badge tone="warn">{due} due in {DUE_WINDOW_DAYS} days</Badge> : undefined}
      />
      {rows.length === 0 ? (
        <p className="admin-empty">Nobody is on probation right now.</p>
      ) : (
        <ul className="ats-cands">
          {rows.map((r) => (
            <li key={r.teamMemberId} className="ats-row">
              <Link href={`/admin/talent/team/${r.teamMemberId}`} className="ats-row-main">
                <AtsPerson name={r.name} meta={[r.position, r.managerName ? `manager ${r.managerName}` : null].filter(Boolean).join(" · ")} />
              </Link>
              <span className="ats-cand-status">
                {dueBadge(r)}
                <Badge tone={r.day8Answered ? "neutral" : "warn"}>{r.day8Score != null ? `Day 8: ${r.day8Score} of 5` : r.day8Answered ? "Day 8: answered" : "Day 8: no answer"}</Badge>
              </span>
              <Link href={`/admin/talent/reviews?subject=${r.teamMemberId}`} className="admin-btn admin-btn--sm">
                Open review
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// How many written answers show before the rest fold away.
const WRITTEN_SHOWN = 4;

/** The Day 8 survey question by question: the ratings, then what people wrote. */
export function Day8Survey({ results, sent, showWritten }: { results: Day8Results; sent: number; showWritten: boolean }) {
  const [first, rest] = [results.written.slice(0, WRITTEN_SHOWN), results.written.slice(WRITTEN_SHOWN)];
  const quote = (w: Day8Results["written"][number], i: number) => (
    <blockquote key={i} className="ats-quote">
      <small>
        {w.question} · {w.name}
      </small>
      {w.text}
    </blockquote>
  );
  return (
    <div className="ats-two">
      <section className="admin-card admin-section-card" aria-label="Day 8 ratings">
        <AtsSectionHead k={`Day 8 survey · ${results.responses} of ${sent} answered`} title="What new hires rated" />
        {results.ratings.length === 0 ? (
          <p className="admin-empty">
            {results.responses === 0 ? "No one has answered the Day 8 survey yet." : "The ratings show once three people have answered, so no one's own rating can be read off."}
          </p>
        ) : (
          <ul className="ats-bars">
            {results.ratings.map((r) => (
              <li key={r.label} className="ats-bar">
                <span>{r.label}</span>
                <progress max={5} value={r.avg} aria-label={`${r.avg} of 5`} />
                <b>{r.avg.toFixed(1)}</b>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="admin-card admin-section-card" aria-label="Day 8 written answers">
        <AtsSectionHead k={`In their words · ${results.writtenCount} answers`} title="What new hires wrote" />
        {!showWritten ? (
          <p className="admin-empty">Written answers show to people who manage the team&apos;s records.</p>
        ) : results.writtenCount === 0 ? (
          <p className="admin-empty">No written answers yet.</p>
        ) : (
          <>
            {first.map(quote)}
            {rest.length > 0 && (
              <details className="u-mt-3">
                <summary className="u-pointer u-strong">Read the other {rest.length}</summary>
                {rest.map(quote)}
              </details>
            )}
          </>
        )}
      </section>
    </div>
  );
}

/** Who left before probation ended, and what their onboarding looked like. */
export function ProbationExits({ exits, hires }: { exits: ProbationExit[]; hires: number }) {
  return (
    <section className="admin-card admin-section-card" aria-label="Lost in probation">
      <AtsSectionHead
        k="Lost in probation · last 12 months"
        title="Who we lost, and what their onboarding looked like"
        aside={<Badge tone={exits.length ? "err" : "ok"}>{exits.length} of {hires} hires</Badge>}
      />
      {exits.length === 0 ? (
        <p className="admin-empty">No one who started in the last 12 months has left during probation.</p>
      ) : (
        <ul className="ats-cands">
          {exits.map((x) => (
            <li key={x.teamMemberId} className="ats-row">
              <span className="ats-row-main">
                <AtsPerson
                  name={x.name}
                  meta={[x.endDate ? `Left ${formatDate(x.endDate)}` : "no last day recorded", x.dayLeft != null ? `day ${x.dayLeft}` : null].filter(Boolean).join(" · ")}
                />
              </span>
              <span className="ats-cand-status">
                {x.decision && <Badge tone={x.decision === "terminate" ? "err" : "neutral"}>Decision: {humanize(x.decision)}</Badge>}
                <Badge tone="neutral">{x.reason ? `Reason: ${x.reason}` : "No reason recorded"}</Badge>
                {!x.hadRecord ? (
                  <Badge tone="warn">No onboarding record</Badge>
                ) : (
                  <>
                    <Badge tone={x.day8Answered ? "neutral" : "warn"}>{x.day8Score != null ? `Day 8: ${x.day8Score} of 5` : x.day8Answered ? "Day 8: answered" : "Day 8: no answer"}</Badge>
                    <Badge tone={x.hadPlan ? "neutral" : "warn"}>{x.hadPlan ? "Had a plan" : "No plan"}</Badge>
                  </>
                )}
              </span>
              <Link href={`/admin/talent/team/${x.teamMemberId}`} className="admin-btn admin-btn--sm">
                Open record
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

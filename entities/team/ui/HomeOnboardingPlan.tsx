import Link from "next/link";
import { formatDate } from "@/kernel/ui/format";
import type { HomeOnboarding } from "@/entities/team/lib/home-onboarding";
import { PLAN_DAYS } from "@/entities/team/lib/home-onboarding";

// The new hire's onboarding plan, first thing on the /team home while they are
// in pre-boarding or probation. Where they are in the 60 days, the manager and
// the next 1-1, the six checkpoints as a timeline, and one button to the plan.
// Presentational; the page resolves the journey (lib/home-onboarding.ts).

export function HomeOnboardingPlan({
  plan,
  roleTitle,
  managerName,
  nextOneOnOneOn,
}: {
  plan: HomeOnboarding;
  roleTitle: string | null;
  managerName: string | null;
  nextOneOnOneOn: string | null;
}) {
  const title =
    plan.dayNumber === null ? `Your first ${PLAN_DAYS} days` : plan.dayNumber < 1 ? "Starting soon" : `Day ${plan.dayNumber} of ${PLAN_DAYS}`;
  const facts = [
    roleTitle,
    managerName ? `manager ${managerName}` : null,
    nextOneOnOneOn ? `next 1-1 ${formatDate(nextOneOnOneOn)}` : null,
    plan.reviewOn ? `probation review ${formatDate(plan.reviewOn)}` : null,
    plan.decisionOn ? `decision ${formatDate(plan.decisionOn)}` : null,
  ].filter(Boolean);
  const planHref = `/team/onboarding/plan/${plan.journeyId}`;

  return (
    <section className="admin-team-plan" aria-label="Your onboarding plan">
      <div className="admin-team-plan-head">
        <div className="u-min-0">
          <span className="admin-start-kicker">Your onboarding plan</span>
          <h2 className="admin-team-plan-title">{title}</h2>
          <p className="admin-team-plan-sub">
            {facts.join(" · ")}
            {!plan.hasPlan && (
              <>
                {facts.length > 0 ? " · " : ""}
                {managerName ?? "Your manager"} uploads your plan before day one
              </>
            )}
          </p>
        </div>
        {plan.hasPlan && (
          <Link href={planHref} className="admin-start-btn admin-team-plan-btn">
            Open your plan →
          </Link>
        )}
      </div>

      <ol className="admin-team-plan-timeline" aria-label="Checkpoints">
        {plan.milestones.map((m) => (
          <li key={m.day} className={`admin-team-plan-step is-${m.state}`}>
            <span className="admin-team-plan-step-day">Day {m.day}</span>
            <span className="admin-team-plan-step-label">{m.label}</span>
            {m.on && <span className="admin-team-plan-step-on">{formatDate(m.on)}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

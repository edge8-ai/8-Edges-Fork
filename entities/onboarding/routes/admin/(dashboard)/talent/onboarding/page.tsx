import { requirePermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { getAllCycleRows, getOnboardingTasks, taskCategoryLabel, getDay8Scores, cycleDay, saigonToday, addDays, backfillJourneys } from "@/entities/onboarding";
import { hiringOutcomes, day8Results } from "@/entities/onboarding/lib/outcomes";
import { getProbationRows } from "@/entities/org";
import { AtsSectionHead, AtsStat } from "@/kernel/ui/talent";
import { DecisionsDue, Day8Survey, ProbationExits, type DecisionDue } from "@/entities/onboarding/ui/OnboardingInsights";
import { OnboardingCycleBoard, type BoardCard } from "@/entities/onboarding";
import {
  adminSetOnboardingPlanLink,
  adminUploadOnboardingPlan,
  adminMoveOnboardingStage,
  adminToggleDay1Task,
  adminSetOnboardingStartDate,
} from "./actions";

export const metadata = {
  title: "Onboarding",
  description: "Every employee inside their first 180 days, across all managers.",
};

// Talent → Onboarding: the company-wide Onboarding Cycle board. Same board as
// the manager view at /team/onboarding, but admin-gated and unscoped — every
// journey, every manager. Loading the page also backfills journeys, so anyone
// under 180 days who is missing a card gets one on the spot.
export default async function AdminOnboardingPage() {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("onboarding.manage");
  // Probation rows, exit reasons and what a named person wrote belong to the
  // team's records, which is org.people. The readers below are told who is
  // asking and build those rows only for a holder (outcomes.test.ts).
  const seesPeople = access.may("org.people");

  await backfillJourneys();
  const today = saigonToday();
  const all = await getAllCycleRows();
  // The board is who is still here. A person who has left keeps their
  // onboarding record, and is listed under "Lost in probation" when that is
  // where they left: until 11 Nov 2026 they stayed on the board as in progress.
  const rows = all.filter((r) => r.member.status !== "alumni");
  const answered = all.filter((r) => r.day8_response_id).map((r) => ({ responseId: r.day8_response_id as string, name: r.member.name }));
  const [tasks, scores, outcomes, survey, probation] = await Promise.all([
    getOnboardingTasks(rows.map((r) => r.team_member_id)),
    getDay8Scores(all.map((r) => r.day8_response_id ?? "").filter(Boolean)),
    hiringOutcomes(today, { people: seesPeople }),
    day8Results(answered, { people: seesPeople }),
    seesPeople ? getProbationRows(today) : Promise.resolve([]),
  ]);

  const rowOf = new Map(all.map((r) => [r.team_member_id, r]));
  const decisions: DecisionDue[] = probation
    .map((p) => {
      const r = rowOf.get(p.teamMemberId);
      return {
        teamMemberId: p.teamMemberId,
        name: p.name,
        position: p.position,
        managerName: p.managerName,
        endsOn: p.endsOn,
        daysLeft: p.daysLeft,
        decision: r?.decision ?? null,
        day8Answered: Boolean(r?.day8_response_id),
        day8Score: r?.day8_response_id ? scores.get(r.day8_response_id) ?? null : null,
      };
    })
    .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
  const sent = all.filter((r) => r.day8_survey_sent_at).length;
  const planned = rows.filter((r) => r.plan_url || r.plan_path).length;
  const decided = outcomes.stayed + outcomes.lost;
  const day8Avg = survey.ratings.length ? survey.ratings.reduce((s, r) => s + r.avg, 0) / survey.ratings.length : null;

  const tasksByMember = new Map<string, { id: string; title: string; done: boolean; group: string }[]>();
  for (const t of tasks) {
    const arr = tasksByMember.get(t.teamMemberId) ?? [];
    arr.push({ id: t.id, title: t.title, done: t.status === "done", group: taskCategoryLabel(t.category) });
    tasksByMember.set(t.teamMemberId, arr);
  }

  const cards: BoardCard[] = rows.map((r) => {
    const start = r.member.startDate;
    return {
      id: r.id,
      // The stored stage is authoritative: humans move it, the cron only
      // advances it forward with the clock.
      columnId: r.stage === "complete" ? "day_180" : r.stage,
      complete: r.stage === "complete",
      name: r.member.name,
      avatarUrl: r.member.avatarUrl,
      positionTitle: r.member.positionTitle,
      startDate: start,
      dayNumber: start ? cycleDay(start, today) : null,
      probationEndsOn: r.member.probationEndsOn ?? (start ? addDays(start, 59) : null),
      contractStartDate: r.member.contractStartDate,
      planUrl: r.plan_url,
      planHasFile: Boolean(r.plan_path),
      planAddedAt: r.plan_uploaded_at,
      day8SurveySentAt: r.day8_survey_sent_at,
      day8Score: r.day8_response_id ? scores.get(r.day8_response_id) ?? null : null,
      day45EmailSentAt: r.day45_email_sent_at,
      decision: r.decision,
      decisionAt: r.decision_at,
      promotedAt: r.day60_promoted_at,
      day180SentAt: r.day180_email_sent_at,
      tasks: tasksByMember.get(r.team_member_id) ?? [],
    };
  });

  const lost = outcomes.lost;
  return (
    <div className="ats">
      <PageHead
        eyebrow="Talent · Onboarding"
        title={`${cards.length} ${cards.length === 1 ? "person is" : "people are"} in their first 180 days. ${lost} ${lost === 1 ? "hire" : "hires"} left before probation ended in the last 12 months.`}
        sub="Everyone still inside their first 180 days, across all managers."
      />
      <ul className="ats-stats" aria-label="Onboarding datapoints">
        <AtsStat value={`${lost} of ${outcomes.hires}`} label="hires lost in probation, last 12 months" tone={lost ? "bad" : undefined} />
        <AtsStat value={outcomes.leftThisYear} label={`people left in ${today.slice(0, 4)}, by recorded last day`} tone={outcomes.leftThisYear ? "bad" : undefined} />
        <AtsStat value={decided ? `${Math.round((outcomes.stayed / decided) * 100)}%` : "No data"} label={`stayed past probation (${outcomes.stayed} of ${decided})`} />
        <AtsStat value={`${survey.responses} of ${sent}`} label="answered the Day 8 survey" />
        <AtsStat value={day8Avg != null ? `${day8Avg.toFixed(1)} / 5` : "Hidden"} label={day8Avg != null ? "Day 8 average" : "Day 8 average, until three people answer"} />
        <AtsStat value={`${planned} of ${cards.length}`} label="still here have an onboarding plan" />
      </ul>

      {seesPeople && <DecisionsDue rows={decisions} />}

      {cards.length === 0 ? (
        <div className="admin-empty">
          Nobody is inside their first 180 days right now. New hires appear here automatically.
        </div>
      ) : (
        <section className="admin-card admin-section-card" aria-label="The onboarding board">
          <AtsSectionHead k="Still here" title="Where each new hire is" />
          <OnboardingCycleBoard
            cards={cards}
            actions={{
              setPlanLink: adminSetOnboardingPlanLink,
              uploadPlan: adminUploadOnboardingPlan,
              setStage: adminMoveOnboardingStage,
              toggleTask: adminToggleDay1Task,
              setStartDate: adminSetOnboardingStartDate,
            }}
            planHrefBase="/admin/talent/onboarding/plan"
          />
        </section>
      )}

      <Day8Survey results={survey} sent={sent} showWritten={seesPeople} />
      {seesPeople && <ProbationExits exits={outcomes.exits} hires={outcomes.hires} />}
    </div>
  );
}

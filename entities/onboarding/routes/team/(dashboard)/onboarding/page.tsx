import { requirePermission } from "@/kernel/identity/access-request";
import { redirect } from "next/navigation";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getReportingSubtreeIds } from "@/kernel/identity/org-tree";
import { PageHead } from "@/kernel/ui/PageHead";
import {
  getCycleRowsFor,
  getOnboardingTasks,
  taskCategoryLabel,
  getDay8Scores,
  cycleDay,
  saigonToday,
  addDays,
} from "@/entities/onboarding/lib/cycle";
import { OnboardingCycleBoard, type BoardCard } from "@/entities/onboarding/ui/OnboardingCycleBoard";
import {
  setOnboardingPlanLink,
  uploadOnboardingPlan,
  moveOnboardingStage,
  toggleDay1Task,
} from "./actions";

export const metadata = {
  title: "Onboarding",
  description: "Your reports' onboarding journeys, from pre-boarding to the 180-day stay interview.",
};

// /team/onboarding — the Edge8 Onboarding Cycle board, manager-only (the
// sidebar shows My Team only to managers; this guard covers direct URLs).
// Every read is scoped to the manager's reporting subtree: everyone below them
// in the org chart, however many levels down, and nobody else. Wider than
// actor.teamMemberScope (direct reports only) on purpose; a hire two levels
// down is still this manager's hire.
export default async function TeamOnboardingPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("onboarding.reports");
  const actor = await requireTeamMember();
  if (actor.role !== "manager") redirect("/team");

  const today = saigonToday();
  const rows = await getCycleRowsFor(await getReportingSubtreeIds(actor.teamMemberId));
  const [tasks, scores] = await Promise.all([
    getOnboardingTasks(rows.map((r) => r.team_member_id)),
    getDay8Scores(rows.map((r) => r.day8_response_id ?? "").filter(Boolean)),
  ]);

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

  return (
    <>
      <PageHead
        title="Onboarding"
        sub={`${cards.length} journey${cards.length === 1 ? "" : "s"} · the cycle runs itself — upload each plan before Day 1 and decide at the 45-day review`}
      />
      {cards.length === 0 ? (
        <div className="admin-empty">
          None of your reports are in onboarding right now. New hires appear here automatically from
          pre-boarding through their 180-day stay interview.
        </div>
      ) : (
        <OnboardingCycleBoard
          cards={cards}
          actions={{
            setPlanLink: setOnboardingPlanLink,
            uploadPlan: uploadOnboardingPlan,
            setStage: moveOnboardingStage,
            toggleTask: toggleDay1Task,
          }}
          planHrefBase="/team/onboarding/plan"
        />
      )}
    </>
  );
}

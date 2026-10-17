import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { PageHead } from "@/kernel/ui/PageHead";
import { getAllCycleRows, getOnboardingTasks, taskCategoryLabel, getDay8Scores, cycleDay, saigonToday, addDays, backfillJourneys } from "@/entities/onboarding";
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
  await requirePermission("onboarding.manage");

  await backfillJourneys();
  const today = saigonToday();
  const rows = await getAllCycleRows();
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
        eyebrow={<Link href="/admin/talent/team">← Team</Link>}
        title="Onboarding"
        sub={`${cards.length} in the cycle · everyone inside their first 180 days, across all managers`}
      />
      {cards.length === 0 ? (
        <div className="admin-empty">
          Nobody is inside their first 180 days right now. New hires appear here automatically.
        </div>
      ) : (
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
      )}
    </>
  );
}

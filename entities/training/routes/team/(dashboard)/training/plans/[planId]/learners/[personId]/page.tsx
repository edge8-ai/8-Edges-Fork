// /team/training/plans/[planId]/learners/[personId] (English Program PR 4): one
// learner in one plan, for the organiser. The living note the learner reads,
// their attendance on the plan's sessions with its source, and what they
// handed in. No stars, load, skip reasons or review notes anywhere on it
// (ADR 0016, amended for the note and for taught-session attendance).
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { PageHead } from "@/kernel/ui/PageHead";
import { readPlan } from "@/entities/training/lib/plan-read";
import { latestNotes } from "@/entities/training/lib/learner-notes";
import { learnerOnPlan } from "@/entities/training/lib/learner-read";
import { LearnerPage } from "@/entities/training/ui/LearnerPage";
import { openSubmissionAction, writeNoteAction } from "./actions";

export const metadata = { title: "Learner", description: "One learner on one plan: the teacher's note, attendance and homework." };

export default async function LearnerPlanPage(props: { params: Promise<{ planId: string; personId: string }> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const { planId, personId } = await props.params;
  const now = new Date();
  const plan = await readPlan(actor.personId, planId, now);
  if (!plan) notFound();
  const learner = plan.roster.find((p) => p.id === personId);
  if (!learner) notFound();
  const [notes, record] = await Promise.all([latestNotes(planId, [personId]), learnerOnPlan(planId, personId)]);
  return (
    <>
      <PageHead
        eyebrow={
          <Link href={`/team/training/plans/${plan.id}`} className="tr-crumb">
            My Team · Training · {plan.title}
          </Link>
        }
        title={learner.name}
        sub={`${plan.title} · ${record.attended} of ${record.sessions.length} sessions attended`}
      />
      <div className="tr-page">
        <LearnerPage planId={plan.id} planTitle={plan.title} personId={personId} learnerName={learner.name} note={notes.get(personId) ?? null} sessions={record.sessions} homework={record.homework} actions={{ writeNote: writeNoteAction, open: openSubmissionAction }} />
      </div>
    </>
  );
}

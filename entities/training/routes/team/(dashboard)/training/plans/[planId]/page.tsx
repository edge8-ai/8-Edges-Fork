// /team/training/plans/[planId] (TR.5, English Program PR 1): one plan for its
// organiser. The roster, publishing to a date, each session with Move and
// Cancel until it starts, and the door to the philosophy. Nothing on it is
// anyone's answer (ADR 0016).
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { listCurrentTeamPeople } from "@/kernel/identity/team-people";
import { saigonToday } from "@/kernel/config/dates";
import { PageHead } from "@/kernel/ui/PageHead";
import { readPlan } from "@/entities/training/lib/plan-read";
import { rhythmLabel } from "@/entities/training/lib/plan-rhythm";
import { listTypes } from "@/entities/training/lib/trainings";
import { formParts, whenLabel } from "@/entities/training/lib/training-format";
import { PlanPage, type SessionItem } from "@/entities/training/ui/PlanPage";
import { weekStartOf } from "@/entities/training/lib/weekly-recap-rules";
import { addSessionAction, archivePlanAction, cancelSessionAction, moveSessionAction, publishPlanAction, setRecipientsAction, setRosterAction, updatePlanAction } from "./actions";

export const metadata = { title: "Training plan", description: "One training plan: its roster, its sessions and its philosophy." };

export default async function TrainingPlanPage(props: { params: Promise<{ planId: string }> }) {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const { planId } = await props.params;
  const now = new Date();
  const [plan, types, team] = await Promise.all([readPlan(actor.personId, planId, now), listTypes(), listCurrentTeamPeople()]);
  if (!plan) notFound();
  const people = team.filter((p) => access.may("training.organise", { person: p.id }));
  const sessions: SessionItem[] = plan.sessions.map((s) => ({
    id: s.id,
    when: whenLabel(s.startsAt, s.endsAt),
    ...formParts(s.startsAt, s.endsAt),
    title: s.title,
    notes: s.notes ?? "",
    people: s.peopleCount,
    state: s.state,
    may: s.may,
    planState: s.planState,
  }));
  const rhythm = rhythmLabel(plan.rhythm);
  return (
    <>
      <PageHead
        eyebrow={
          <Link href="/team/training" className="tr-crumb">
            My Team · Training
          </Link>
        }
        title={plan.title}
        sub={`${plan.typeName} · ${rhythm}${plan.larkTitle ? ` · Lark: “${plan.larkTitle}”` : ""}`}
      />
      <div className="tr-page">
        <PlanPage
          plan={{
            id: plan.id,
            title: plan.title,
            draft: { typeId: plan.typeId, title: plan.title, weekdays: plan.rhythm.weekdays, start: plan.rhythm.start, end: plan.rhythm.end, larkTitle: plan.larkTitle ?? "" },
            rhythm,
            publishedUntil: plan.publishedUntil,
            larkTitle: plan.larkTitle,
            hasPhilosophy: plan.philosophy !== null,
            recipients: plan.recipients.map((r) => r.email),
            recipientNames: plan.recipientNames,
            thisWeek: weekStartOf(saigonToday()),
          }}
          roster={plan.roster}
          sessions={sessions}
          types={types.map((t) => ({ id: t.id, name: t.name }))}
          people={people}
          today={saigonToday()}
          actions={{
            update: updatePlanAction,
            roster: setRosterAction,
            publish: publishPlanAction,
            add: addSessionAction,
            move: moveSessionAction,
            cancel: cancelSessionAction,
            archive: archivePlanAction,
            recipients: setRecipientsAction,
          }}
        />
      </div>
    </>
  );
}

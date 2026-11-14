// /team/training/plans/[planId]/philosophy (TR.5, English Program PR 1): the
// programme brief every prep draft and recap reads first, in the organiser's
// words. Seeded once by Claude from a pasted transcript, then edited here. The
// learners see the same text read-only on My Training.
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { PageHead } from "@/kernel/ui/PageHead";
import { formatDate } from "@/kernel/ui/format";
import { readPlan } from "@/entities/training/lib/plan-read";
import { PhilosophyEditor } from "@/entities/training/ui/PhilosophyEditor";
import { savePhilosophyAction, seedPhilosophyAction } from "../actions";

export const metadata = { title: "Programme philosophy", description: "What the programme is for and how it is taught." };

export default async function PhilosophyPage(props: { params: Promise<{ planId: string }> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const { planId } = await props.params;
  const plan = await readPlan(actor.personId, planId, new Date());
  if (!plan) notFound();
  const edited = plan.philosophyUpdatedAt ? `last edited ${formatDate(plan.philosophyUpdatedAt)}${plan.philosophyUpdatedBy ? ` by ${plan.philosophyUpdatedBy}` : ""}` : "not written yet";
  return (
    <>
      <PageHead
        eyebrow={
          <Link href={`/team/training/plans/${plan.id}`} className="tr-crumb">
            My Team · Training · {plan.title}
          </Link>
        }
        title="Programme philosophy"
        sub={`${plan.title} · ${edited}. Every prep draft and recap reads this first; the learners see it read-only.`}
      />
      <div className="tr-page">
        <PhilosophyEditor planId={plan.id} planTitle={plan.title} initial={plan.philosophy} actions={{ seed: seedPhilosophyAction, save: savePhilosophyAction }} />
      </div>
    </>
  );
}

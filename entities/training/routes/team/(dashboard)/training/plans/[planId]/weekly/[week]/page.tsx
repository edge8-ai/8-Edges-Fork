// /team/training/plans/[planId]/weekly/[week] (English Program PR 9): one
// week's recap for the organiser. Drafted Friday, it waits here until Monday
// 08:00: edit it, add your own note, send it now or hold it. The recipients
// are shown before send. Nothing in it is a rating, a load, a skip reason or a
// review (ADR 0016); the progress lines paraphrase what the learners have seen.
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { PageHead } from "@/kernel/ui/PageHead";
import { readPlan } from "@/entities/training/lib/plan-read";
import { listWeeklyRecaps, readWeeklyRecap } from "@/entities/training/lib/weekly-recap";
import { weekLabel } from "@/entities/training/lib/weekly-recap-rules";
import { WeeklyRecapEditor } from "@/entities/training/ui/WeeklyRecapEditor";
import { editWeeklyRecapAction, holdWeeklyRecapAction, sendWeeklyRecapNowAction } from "./actions";

export const metadata = { title: "Weekly recap", description: "One week's recap of a training plan, for the people who pay for it." };

export default async function WeeklyRecapPage(props: { params: Promise<{ planId: string; week: string }> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const { planId, week } = await props.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) notFound();
  const plan = await readPlan(actor.personId, planId, new Date());
  if (!plan) notFound();
  const [recap, past] = await Promise.all([readWeeklyRecap(planId, week), listWeeklyRecaps(planId)]);
  const recipients = plan.recipientNames;
  return (
    <>
      <PageHead
        eyebrow={
          <Link href={`/team/training/plans/${plan.id}`} className="tr-crumb">
            My Team · Training · {plan.title}
          </Link>
        }
        title={weekLabel(week)}
        sub={`${plan.title} · goes to ${recipients.length ? recipients.join(", ") : "nobody yet (set recipients on the plan)"}`}
      />
      <div className="tr-page">
        <WeeklyRecapEditor planId={plan.id} week={week} recap={recap} names={Object.fromEntries(plan.roster.map((p) => [p.id, p.name]))} past={past.filter((r) => r.weekStart !== week).map((r) => ({ weekStart: r.weekStart, step: r.step, label: weekLabel(r.weekStart) }))} actions={{ edit: editWeeklyRecapAction, send: sendWeeklyRecapNowAction, hold: holdWeeklyRecapAction }} />
      </div>
    </>
  );
}

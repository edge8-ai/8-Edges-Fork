// /team/training (TR.2): My Team › Training, for whoever organises trainings: a
// manager for their team, Admin and the Training organiser role for everyone.
// It lists what the organiser scheduled and who is on each, never anyone's
// answer (ADR 0016); the plans they run (TR.5) sit above the single trainings;
// the programme read arrives here with TR.7.
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { listCurrentTeamPeople } from "@/kernel/identity/team-people";
import { saigonToday } from "@/kernel/config/dates";
import { PageHead } from "@/kernel/ui/PageHead";
import { organiserMay, trainingState } from "@/entities/training/lib/training-rules";
import { listTypes, organisedTrainings } from "@/entities/training/lib/trainings";
import { organisedPlans } from "@/entities/training/lib/plan-read";
import { rhythmLabel } from "@/entities/training/lib/plan-rhythm";
import { formParts, typeTone, whenLabel } from "@/entities/training/lib/training-format";
import { OrganiseTrainings, type OrganisedItem } from "@/entities/training/ui/OrganiseTrainings";
import { OrganisePlans } from "@/entities/training/ui/OrganisePlans";
import { cancelTrainingAction, createPlanAction, scheduleTrainingAction, updateTrainingAction } from "./actions";

export const metadata = { title: "Training", description: "Schedule trainings for your team." };

export default async function OrganiseTrainingPage() {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const [trainings, types, team, plans] = await Promise.all([organisedTrainings(actor.personId), listTypes(), listCurrentTeamPeople(), organisedPlans(actor.personId)]);
  const now = new Date();
  // Only the people this organiser's reach covers can be put on a training.
  const people = team.filter((p) => access.may("training.organise", { person: p.id }));
  const items: OrganisedItem[] = trainings.map((t) => ({
    id: t.id,
    title: t.title,
    notes: t.notes ?? "",
    typeId: t.typeId,
    typeName: t.typeName,
    tone: typeTone(t.typeRank),
    when: whenLabel(t.startsAt, t.endsAt),
    ...formParts(t.startsAt, t.endsAt),
    people: t.people,
    state: trainingState({ startsAt: t.startsAt, cancelledAt: t.cancelledAt }, now),
    may: organiserMay({ startsAt: t.startsAt, cancelledAt: t.cancelledAt }, now),
  }));
  return (
    <>
      <PageHead eyebrow="My Team" title="Training" sub="Schedule trainings for people. Each one asks them, once it starts, whether they went." />
      <div className="tr-page">
        <OrganisePlans
          plans={plans.map((p) => ({ id: p.id, title: p.title, typeName: p.typeName, rhythm: rhythmLabel(p.rhythm), publishedUntil: p.publishedUntil, people: p.roster.length }))}
          types={types.map((t) => ({ id: t.id, name: t.name }))}
          create={createPlanAction}
        />
        <OrganiseTrainings
          items={items}
          types={types.map((t) => ({ id: t.id, name: t.name }))}
          people={people}
          today={saigonToday()}
          actions={{ schedule: scheduleTrainingAction, update: updateTrainingAction, cancel: cancelTrainingAction }}
        />
      </div>
    </>
  );
}

// /team/training/exercises (English Program PR 2): the exercise library every
// session plan draws on. Add one from a form, or paste a document and confirm
// the rows Claude split out. Filters by side, skill, format and a search.
import Link from "next/link";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { PageHead } from "@/kernel/ui/PageHead";
import { facets, listExercises } from "@/entities/training/lib/exercises";
import { organisedPlans } from "@/entities/training/lib/plan-read";
import { ExerciseLibrary } from "@/entities/training/ui/ExerciseLibrary";
import { addExerciseAction, confirmDraftsAction, retireExerciseAction, splitDocumentAction, updateExerciseAction } from "./actions";

export const metadata = { title: "Exercises", description: "The exercise library every session plan draws on." };

export default async function ExercisesPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("training.organise");
  const actor = await requireTeamMember();
  const [exercises, plans] = await Promise.all([listExercises({ withRetired: true }), organisedPlans(actor.personId)]);
  const live = exercises.filter((e) => !e.archived);
  return (
    <>
      <PageHead
        eyebrow={
          <Link href="/team/training" className="tr-crumb">
            My Team · Training
          </Link>
        }
        title="Exercises"
        sub={`${live.length} live · ${exercises.length - live.length} retired. The prep draft chooses from here and nowhere else.`}
      />
      <div className="tr-page">
        <ExerciseLibrary
          exercises={exercises}
          facets={facets(live)}
          plans={plans.map((p) => ({ id: p.id, title: p.title }))}
          actions={{ add: addExerciseAction, update: updateExerciseAction, retire: retireExerciseAction, split: splitDocumentAction, confirm: confirmDraftsAction }}
        />
      </div>
    </>
  );
}

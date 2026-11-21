// /admin/settings/training-types (TR.2): the kinds of training this
// organisation runs, which the scheduling and logging pickers offer. Admin only.
import { requirePermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { listTypes } from "@/entities/training/lib/trainings";
import { TrainingTypesEditor } from "@/entities/training/ui/TrainingTypesEditor";
import { addTrainingType, renameTrainingType, retireTrainingType } from "./actions";

export const metadata = { title: "Training types", description: "The kinds of training this organisation runs." };

export default async function TrainingTypesPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("training.types");
  const types = await listTypes({ withRetired: true });
  return (
    <>
      <PageHead eyebrow="Settings" title="Training types" sub="The kinds of training people log and organisers schedule. Retiring one keeps its history." />
      <TrainingTypesEditor
        types={types.map((t) => ({ id: t.id, name: t.name, archived: t.archived }))}
        actions={{ add: addTrainingType, rename: renameTrainingType, retire: retireTrainingType }}
      />
    </>
  );
}

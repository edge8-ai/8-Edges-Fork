import { notFound } from "next/navigation";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { Id } from "@/entities/reimbursements/lib/action-inputs";
import { formsOf, isFormKind } from "@/entities/reimbursements/lib/advance-forms";
import { readAdvanceForForm } from "@/entities/reimbursements/lib/advance-queue";
import { AdvancePaper } from "@/entities/reimbursements/ui/AdvancePaper";

export const metadata = {
  title: "Advance Form",
  description: "Your advance's 03-TT or 04-TT, printable.",
};

// /team/claims/advances/[id]/printable/[kind]: a paper for its owner (AD.11). Someone else's reads
// as one that does not exist, in the query that reads it.
export default async function OwnAdvanceFormPage({ params }: { params: Promise<{ id: string; kind: string }> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("reimbursements.mine");
  const actor = await requireTeamMember();
  const { id, kind } = await params;
  if (!Id.safeParse(id).success || !isFormKind(kind)) notFound();
  const advance = await readAdvanceForForm(id, { ownedBy: actor.personId });
  if (!advance || !formsOf({ status: advance.row.status, submittedAt: advance.row.submittedAt, spentVnd: advance.spentVnd }).includes(kind)) notFound();
  return <AdvancePaper kind={kind} facts={advance.facts} back={`/team/claims/advances/${id}`} />;
}

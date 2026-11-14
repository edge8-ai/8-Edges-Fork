import { notFound } from "next/navigation";
import { requirePermission } from "@/kernel/identity/access-request";
import { Id } from "@/entities/reimbursements/lib/action-inputs";
import { formsOf, isFormKind } from "@/entities/reimbursements/lib/advance-forms";
import { readAdvanceForForm } from "@/entities/reimbursements/lib/advance-queue";
import { financeAdvancePath } from "@/entities/reimbursements/lib/paths";
import { AdvancePaper } from "@/entities/reimbursements/ui/AdvancePaper";

export const metadata = {
  title: "Advance Form",
  description: "An advance's 03-TT or 04-TT, printable.",
};

// /team/finance/advances/[id]/printable/[kind]: a paper for whoever records the money (AD.11).
export default async function FinanceAdvanceFormPage({ params }: { params: Promise<{ id: string; kind: string }> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("reimbursements.pay");
  const { id, kind } = await params;
  if (!Id.safeParse(id).success || !isFormKind(kind)) notFound();
  const advance = await readAdvanceForForm(id, {});
  if (!advance || !formsOf({ status: advance.row.status, submittedAt: advance.row.submittedAt, spentVnd: advance.spentVnd }).includes(kind)) notFound();
  return <AdvancePaper kind={kind} facts={advance.facts} back={financeAdvancePath(id)} />;
}

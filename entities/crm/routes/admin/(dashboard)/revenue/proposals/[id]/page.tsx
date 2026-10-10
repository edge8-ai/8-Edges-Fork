import { notFound } from "next/navigation";
import { requirePermission } from "@/kernel/identity/access-request";
import { mayProp } from "@/kernel/identity/may-prop";
import { proposalReview } from "@/entities/crm/lib/proposal-view";
import { ProposalReview } from "@/entities/crm/ui/ProposalReview";

export const metadata = {
  title: "Proposal review",
};

// The proposal review page (Z.10): the proposal as the client will read it,
// with the decision beside it. Whoever works the pipeline may read it, edit it
// and apply the CRM changes the call implies; only the Revenue approver
// (crm.proposal-approve) approves or rejects it. A shadow draft is shown read
// only, to be compared with the proposal made by hand for the same call.
export default async function ProposalReviewPage(props: { params: Promise<{ id: string }> }) {
  const access = await requirePermission("crm.pipeline");
  const { id } = await props.params;
  const review = await proposalReview(id);
  if (!review) notFound();
  return <ProposalReview review={review} may={mayProp(access, ["crm.pipeline", "crm.proposal-approve", "crm.calls"])} />;
}

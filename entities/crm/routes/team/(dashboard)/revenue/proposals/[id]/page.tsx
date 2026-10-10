// The admin page, served again under /team. The team layout has already
// required a team member; this adds the pipeline permission (admins pass too).
import { requirePermission } from "@/kernel/identity/access-request";
import AdminPage from "@/entities/crm/routes/admin/(dashboard)/revenue/proposals/[id]/page";
export { metadata } from "@/entities/crm/routes/admin/(dashboard)/revenue/proposals/[id]/page";

export default async function TeamProposalReviewPage(props: { params: Promise<{ id: string }> }) {
  await requirePermission("crm.pipeline");
  return <AdminPage {...props} />;
}

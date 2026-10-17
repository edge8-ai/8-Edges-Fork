// The admin page, served again under /team. The team layout has already
// required a team member; this adds the revenue permission (admins pass too).
import { requirePermission } from "@/kernel/identity/access-request";
import AdminPage from "@/entities/crm/routes/admin/(dashboard)/revenue/meetings/[id]/page";
export { metadata } from "@/entities/crm/routes/admin/(dashboard)/revenue/meetings/[id]/page";

export default async function TeamMeetingDetailPage(props: { params: Promise<{ id: string }> }) {
  await requirePermission("crm.calls");
  return (
    <AdminPage {...props} />
  );
}

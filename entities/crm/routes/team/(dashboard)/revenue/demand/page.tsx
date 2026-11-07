// The admin page, served again under /team. The team layout has already
// required a team member; this adds the revenue permission (admins pass too).
import { requirePermission } from "@/kernel/identity/access-request";
import AdminPage from "@/entities/crm/routes/admin/(dashboard)/revenue/demand/page";
export { metadata } from "@/entities/crm/routes/admin/(dashboard)/revenue/demand/page";

export default async function TeamDemandPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission("crm.pipeline");
  return (
    <AdminPage {...props} />
  );
}

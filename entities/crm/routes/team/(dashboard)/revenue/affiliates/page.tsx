// The admin page, served again under /team. The team layout has already
// required a team member; this adds the revenue permission (admins pass too).
import { requirePermission } from "@/kernel/identity/access-request";
import AdminPage from "@/entities/crm/routes/admin/(dashboard)/revenue/affiliates/page";
export { metadata } from "@/entities/crm/routes/admin/(dashboard)/revenue/affiliates/page";

export default async function TeamAffiliatesPage() {
  await requirePermission("crm.pipeline");
  return <AdminPage />;
}

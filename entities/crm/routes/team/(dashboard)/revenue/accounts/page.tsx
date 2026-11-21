// The admin page, served again under /team. The team layout has already
// required a team member; this adds the revenue permission (admins pass too).
import { requirePermission } from "@/kernel/identity/access-request";
import AdminPage from "@/entities/crm/routes/admin/(dashboard)/revenue/accounts/page";
export { metadata } from "@/entities/crm/routes/admin/(dashboard)/revenue/accounts/page";

export default async function TeamAccountsPage(props: { searchParams: Promise<import("@/kernel/ui/url").SearchParamsObj> }) {
  await requirePermission("crm.pipeline");
  return (
    <AdminPage {...props} />
  );
}

// The admin page, served again under /team. The team layout has already
// required a team member; this adds the revenue permission (admins pass too).
import { requirePermission } from "@/kernel/identity/access-request";
import AdminPage from "@/entities/company-os/routes/admin/(dashboard)/revenue/products/page";
export { metadata } from "@/entities/company-os/routes/admin/(dashboard)/revenue/products/page";

export default async function TeamProductsPage(props: { searchParams: Promise<import("@/kernel/ui/url").SearchParamsObj> }) {
  await requirePermission("company-os.commerce");
  return (
    <AdminPage {...props} />
  );
}

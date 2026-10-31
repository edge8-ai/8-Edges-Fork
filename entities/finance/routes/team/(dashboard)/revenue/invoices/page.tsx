// The admin page, served again under /team. The team layout has already
// required a team member; this adds the revenue permission (admins pass too).
import { requirePermission } from "@/kernel/identity/access-request";
import AdminPage from "@/entities/finance/routes/admin/(dashboard)/revenue/invoices/page";
export { metadata } from "@/entities/finance/routes/admin/(dashboard)/revenue/invoices/page";

export default async function TeamInvoicesPage(props: { searchParams: Promise<import("@/kernel/ui/url").SearchParamsObj> }) {
  await requirePermission("finance.invoices");
  return (
    <AdminPage {...props} />
  );
}

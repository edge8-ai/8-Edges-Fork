// The admin page, served again under /team. The team layout has already
// required a team member; this adds the revenue permission (admins pass too).
import { requirePermission } from "@/kernel/identity/access-request";
import AdminPage from "@/entities/retreats/routes/admin/(dashboard)/revenue/events/page";
export { metadata } from "@/entities/retreats/routes/admin/(dashboard)/revenue/events/page";

export default async function TeamEventsPage() {
  await requirePermission("retreats.events");
  return <AdminPage />;
}

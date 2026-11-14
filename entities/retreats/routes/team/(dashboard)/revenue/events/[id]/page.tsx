// The admin page, served again under /team. The team layout has already
// required a team member; this adds the revenue permission (admins pass too).
// The trip-cost slot the mount hands in is passed on to the admin page.
import type { ComponentProps } from "react";
import { requirePermission } from "@/kernel/identity/access-request";
import AdminPage from "@/entities/retreats/routes/admin/(dashboard)/revenue/events/[id]/page";

export default async function TeamEventDetailPage(props: ComponentProps<typeof AdminPage>) {
  await requirePermission("retreats.events");
  return (
    <AdminPage {...props} />
  );
}

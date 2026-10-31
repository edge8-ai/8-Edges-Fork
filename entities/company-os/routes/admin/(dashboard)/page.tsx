import { requirePermission } from "@/kernel/identity/access-request";
import { adminHome } from "@/entities/company-os/lib/admin-home";
import { AdminHome } from "@/entities/company-os/ui/AdminHome";
import { readAdminHome } from "./home-read";

// Admin opens on Home (AH.2, 2026-10-27): what needs the reader
// today, the way My Week answers it for their cards. The company at a glance
// moved one level down, to Company → Dashboard (/admin/company/dashboard).
export const metadata = {
  title: "Home",
  description: "What needs you today: what waits on your decision, your cards, your follow-ups and the team's week.",
};

export default async function AdminHomePage() {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("surface.admin");
  const input = await readAdminHome(access, access.user.email);
  return <AdminHome model={adminHome(input)} />;
}

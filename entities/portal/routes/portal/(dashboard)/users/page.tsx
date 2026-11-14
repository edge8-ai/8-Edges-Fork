import { notFound } from "next/navigation";
import { requirePortalPermission } from "@/kernel/identity/access-request";
import { adminCompanyScope } from "@/entities/portal/lib/roles";
import { listCompanyUsers, type CompanyUser } from "@/entities/portal/lib/users";
import { PageHead } from "@/kernel/ui/PageHead";
import { UsersView } from "./UsersView";

export const metadata = {
  title: "Users",
  description: "Manage who on your team can access the portal.",
};

// Admin-only (PR 3): one section per company the actor administers. Non-admins
// never see the nav item; a direct visit 404s.
export default async function UsersPage() {
  const actor = await requirePortalPermission("surface.portal");
  const companies = actor.memberships.filter(
    (m) => m.companyId && adminCompanyScope(actor).includes(m.companyId),
  );
  if (companies.length === 0) notFound();

  const sections: Array<{ companyId: string; companyName: string; users: CompanyUser[] }> = [];
  for (const c of companies) {
    const users = await listCompanyUsers(actor, c.companyId as string);
    if (users) {
      sections.push({
        companyId: c.companyId as string,
        companyName: c.companyName ?? "Your company",
        users,
      });
    }
  }

  return (
    <div className="admin-content">
      <PageHead
        eyebrow="Client Portal"
        title="Users"
        sub="Invite your team to the portal and control what each person can do. Admins manage everything, contributors add to the roadmap and upload documents, viewers read."
      />
      {sections.map((s) => (
        <UsersView key={s.companyId} companyId={s.companyId} companyName={s.companyName} users={s.users} />
      ))}
    </div>
  );
}

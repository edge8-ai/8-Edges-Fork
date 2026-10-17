import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { CompanyDocEmbed } from "@/entities/team/ui/CompanyDocEmbed";
import { HANDBOOK_DOC_PATH } from "@/entities/team/lib/company-docs";

export const metadata = { title: "Handbook" };

// /team/handbook — the Employee Handbook, framed from the private library so a
// member reads it inside the portal.
export default async function TeamHandbookPage() {
  // The page's declared permission (entities/team/permissions.ts, ADR 0013).
  await requirePermission("team.culture");
  await requireTeamMember();
  return (
    <CompanyDocEmbed
      title="Employee Handbook"
      sub="Policies, benefits, leave, conduct and how we work, in English and Vietnamese."
      path={HANDBOOK_DOC_PATH}
    />
  );
}

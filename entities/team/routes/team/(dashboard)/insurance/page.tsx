import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { CompanyDocEmbed } from "@/entities/team/ui/CompanyDocEmbed";
import { INSURANCE_DOC_PATH } from "@/entities/team/lib/company-docs";

export const metadata = { title: "Health Insurance" };

// /team/insurance — the health insurance guide (what is covered, direct billing
// or claim, where to go), framed from the private library.
export default async function TeamInsurancePage() {
  // The page's declared permission (entities/team/permissions.ts, ADR 0013).
  await requirePermission("team.benefits");
  await requireTeamMember();
  return (
    <CompanyDocEmbed
      title="Health Insurance"
      sub="What the plan covers, how to use direct billing or claim, and which hospitals and clinics take it."
      path={INSURANCE_DOC_PATH}
    />
  );
}

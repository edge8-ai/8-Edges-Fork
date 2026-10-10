import { requirePermission } from "@/kernel/identity/access-request";
import { CompanyDocEmbed } from "@/entities/team/ui/CompanyDocEmbed";
import { INSURANCE_DOC_PATH } from "@/entities/team/lib/company-docs";

export const metadata = { title: "Health Insurance" };

// /admin/company/insurance — the same health insurance guide the team reads
// at /team/insurance, framed inside the admin shell.
export default async function AdminInsurancePage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("team.company-manage");
  return (
    <CompanyDocEmbed
      title="Health Insurance"
      sub="What the plan covers, how to use direct billing or claim, and which hospitals and clinics take it."
      path={INSURANCE_DOC_PATH}
    />
  );
}

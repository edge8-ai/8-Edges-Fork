import { requirePermission } from "@/kernel/identity/access-request";
import { CompanyDocEmbed } from "@/entities/team/ui/CompanyDocEmbed";
import { HANDBOOK_DOC_PATH } from "@/entities/team/lib/company-docs";

export const metadata = { title: "Handbook" };

// /admin/company/handbook — the same Employee Handbook the team reads at
// /team/handbook, framed inside the admin shell.
export default async function AdminHandbookPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("team.company-manage");
  return (
    <CompanyDocEmbed
      title="Employee Handbook"
      sub="Policies, benefits, leave, conduct and how we work, in English and Vietnamese."
      path={HANDBOOK_DOC_PATH}
    />
  );
}

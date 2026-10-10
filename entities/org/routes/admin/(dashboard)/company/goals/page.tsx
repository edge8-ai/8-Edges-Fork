import { requirePermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { Tabs } from "@/kernel/ui/Tabs";
import { getCompanyGoals } from "@/entities/team";
import { getAdminRosterGoals } from "@/entities/coaching";
import { CompanyGoalsEditor } from "./CompanyGoalsEditor";
import { IndividualGoalsEditor } from "./IndividualGoalsEditor";

export const metadata = { title: "Company Goals" };

// /admin/company/goals — the single place company goals are edited. Tab one is
// the company objectives + key results (inline add / edit / check-in); tab two
// is every member's individual FAST goals, which an admin can also edit here.
// Both drive the read-only /team/company-goals view the whole team sees.
export default async function AdminCompanyGoalsPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("org.company");
  const [{ quarter, tree, initialsById, ladderedByKr }, roster] = await Promise.all([
    getCompanyGoals(),
    getAdminRosterGoals(),
  ]);

  const companyPanel = (
    <CompanyGoalsEditor
      tree={tree}
      initialsById={initialsById}
      ladderedByKr={ladderedByKr}
      quarter={quarter.label}
      emptyLabel={`No objectives for ${quarter.start.getFullYear()} yet. Add the first one.`}
    />
  );

  const teamPanel = (
    <IndividualGoalsEditor members={roster.members} edges={roster.edges} quarter={quarter.label} />
  );

  return (
    <>
      <PageHead eyebrow="Company" title="Company Goals" sub={`${quarter.label} · week ${quarter.week} of ${quarter.totalWeeks}`} />
      <Tabs
        tabs={[
          { key: "company", label: "Company goals", content: companyPanel },
          { key: "team", label: "Individual goals", count: roster.members.length, content: teamPanel },
        ]}
      />
    </>
  );
}

import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { PageHead } from "@/kernel/ui/PageHead";
import { CompanyGoalsObjectives, TeamGoalsPanel } from "@/entities/org";
import { getCompanyGoals } from "@/entities/team";
import { Tabs } from "@/kernel/ui/Tabs";

export const metadata = {
  title: "Company Goals",
  description: "Company objectives and key results for the year, reviewed each quarter, plus every team member's FAST goals.",
};

// /team/company-goals — read-only, company-visible view of the quarter's
// company goals (objectives + key results). Same data as /admin/edges/goals but
// without the cascade, editing, or check-ins: every team member sees where the
// company is aiming and how far along each key result is. A second tab lists
// every active team member's FAST goals (Transparent is the T in FAST),
// groupable by member or by the company objective each goal ladders to. Both
// the derivation (lib/company/goals) and the rendering (components/company) are
// shared with the admin Company section.
export default async function TeamCompanyGoalsPage() {
  // The page's declared permission (entities/team/permissions.ts, ADR 0013).
  await requirePermission("team.company");
  await requireTeamMember();
  const { quarter, tree, initialsById, byPerson, byObjective, withGoal, departments } = await getCompanyGoals();

  const companyPanel = (
    <CompanyGoalsObjectives tree={tree} initialsById={initialsById} emptyLabel={`No objectives for ${quarter.start.getFullYear()} yet.`} />
  );
  const teamPanel = (
    <TeamGoalsPanel
      byPerson={byPerson}
      byObjective={byObjective}
      withGoal={withGoal}
      departments={departments}
      personHrefBase="/team/directory"
    />
  );

  return (
    <>
      <PageHead
        eyebrow="Company"
        title="Company Goals"
        sub={`${quarter.label} · week ${quarter.week} of ${quarter.totalWeeks}`}
      />
      <Tabs
        tabs={[
          { key: "company", label: "Company goals", content: companyPanel },
          { key: "team", label: "Team member goals", count: byPerson.length, content: teamPanel },
        ]}
      />
    </>
  );
}

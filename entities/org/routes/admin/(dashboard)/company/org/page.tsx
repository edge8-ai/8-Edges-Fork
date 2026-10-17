import { requirePermission } from "@/kernel/identity/access-request";
import { loadOrgChart } from "@/entities/team";
import { PageHead } from "@/kernel/ui/PageHead";
import { OrgChart } from "@/entities/org/ui/company/OrgChart";
import { OrgChartEmpty, OrgChartUnavailable } from "@/entities/org/ui/company/OrgChartStates";
import { setReportingLine } from "./actions";

export const metadata = { title: "Org Chart" };

// /admin/company/org — the same tree as /team/org, plus a Record gaps panel.
// Reporting lines live on team_members.manager_id; an admin who may manage the
// team's records (org.people, the atom that guards the Talent record holding
// the same field) gets an edit mode on the tree itself.
export default async function AdminOrgPage() {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("org.company");
  const loaded = await loadOrgChart();

  if (!loaded) {
    return (
      <>
        <PageHead eyebrow="Company" title="Org Chart" />
        <OrgChartUnavailable retryHref="/admin/company/org" />
      </>
    );
  }
  const { entries, openRoles } = loaded;
  const openCount = openRoles.length;

  return (
    <>
      <PageHead
        eyebrow="Company"
        title="Org Chart"
        sub={`${entries.length} ${entries.length === 1 ? "person" : "people"}${openCount ? ` · ${openCount} open ${openCount === 1 ? "role" : "roles"}` : ""}`}
      />
      {entries.length === 0 ? (
        <OrgChartEmpty talentHref="/admin/talent/team" />
      ) : (
        <OrgChart
          entries={entries}
          openRoles={openRoles}
          personHrefBase="/admin/talent/team/"
          roleHrefBase="/admin/talent/jobs/"
          showGaps
          onSetReportingLine={access.may("org.people") ? setReportingLine : undefined}
        />
      )}
    </>
  );
}

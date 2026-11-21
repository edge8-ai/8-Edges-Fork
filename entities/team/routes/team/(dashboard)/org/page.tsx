import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { loadOrgChart } from "@/entities/team/lib/data";
import { PageHead } from "@/kernel/ui/PageHead";
import { OrgChart, OrgChartEmpty, OrgChartUnavailable } from "@/entities/org";

export const metadata = {
  title: "Org Chart",
  description: "How the company fits together: the reporting tree, live from the directory.",
};

// /team/org — the reporting tree, read-only and company-visible like the
// directory. The chart itself is entities/org's OrgChart, shared with the admin
// Company section; here it opens on the viewer and links to the team directory.
export default async function TeamOrgPage() {
  // The page's declared permission (entities/team/permissions.ts, ADR 0013).
  await requirePermission("team.directory");
  const actor = await requireTeamMember();
  const loaded = await loadOrgChart();

  if (!loaded) {
    return (
      <>
        <PageHead eyebrow="Company" title="Org Chart" />
        <OrgChartUnavailable retryHref="/team/org" />
      </>
    );
  }
  const { entries, openRoles } = loaded;

  return (
    <>
      <PageHead eyebrow="Company" title="Org Chart" sub={`${entries.length} ${entries.length === 1 ? "person" : "people"} · live from the directory`} />
      {entries.length === 0 ? (
        <OrgChartEmpty />
      ) : (
        <OrgChart entries={entries} openRoles={openRoles} personHrefBase="/team/directory/" viewerId={actor.teamMemberId} />
      )}
    </>
  );
}

import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getDirectory } from "@/entities/team/lib/data";
import { PageHead } from "@/kernel/ui/PageHead";
import { DirectoryTable } from "@/entities/team/ui/DirectoryTable";

export const metadata = {
  title: "Directory",
  description: "Who's who at Edge8: roles, departments, and reporting lines.",
};

// /team/directory — read-only, company-visible roster. getDirectory() returns a
// FIXED safe column list (names/roles only — no contact details, and never the
// team_directory view, which carries leave balances). Search, sort, and the
// department/manager filters all run client-side over this small set.
export default async function TeamDirectoryPage() {
  // The page's declared permission (entities/team/permissions.ts, ADR 0013).
  await requirePermission("team.directory");
  await requireTeamMember();
  const entries = await getDirectory();

  return (
    <>
      <PageHead eyebrow="Me" title="Directory" sub="Who's who at Edge8" />
      {entries.length === 0 ? (
        <div className="admin-empty">No team members found.</div>
      ) : (
        <DirectoryTable entries={entries} />
      )}
    </>
  );
}

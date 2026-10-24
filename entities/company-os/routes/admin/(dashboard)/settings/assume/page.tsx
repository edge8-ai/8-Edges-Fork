import { requirePermission } from "@/kernel/identity/access-request";
import { listAssumableClients } from "@/entities/company-os/lib/portal-assume";
import { PageHead } from "@/kernel/ui/PageHead";
import { ASSUME_SESSION_MINUTES } from "@/kernel/identity/portal-auth";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { ClientsActiveToggle, startAssumeSession } from "@/entities/crm";
import { EndTeamAssumeButton, endTeamAssume, listAssumableTeamMembers, openTeamAssume, startTeamAssume } from "@/entities/team";
import { mayProp } from "@/kernel/identity/may-prop";
import { AssumeManager } from "./AssumeManager";
import { TeamAssumeList } from "./TeamAssumeList";

// Settings → Assume. View the client portal exactly as one of the active
// client companies would see it, without ever leaving your admin session.
// Matches the admin Clients list: active clients by default, with a toggle to
// reveal inactive companies.
export default async function AssumePage(props: { searchParams: Promise<SearchParamsObj> }) {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("company-os.clients");
  // The Team half is Super Admin's (team.assume): a team member's own pages
  // show their pay and personal record.
  const mayTeam = access.may("team.assume");
  const [members, openTeam] = mayTeam ? await Promise.all([listAssumableTeamMembers(), openTeamAssume(access.user.email)]) : [[], null];
  const searchParams = await props.searchParams;
  const showInactive = firstParam(searchParams.inactive) === "1";
  const clients = await listAssumableClients(showInactive);

  const noun = clients.length === 1 ? "company" : "companies";
  const sessionNote = `Sessions expire after ${ASSUME_SESSION_MINUTES} minutes and can be ended anytime from the banner shown on every portal page.`;

  return (
    <>
      <PageHead
        eyebrow="Settings"
        title="Assume"
        sub={
          showInactive
            ? `View /portal as any of ${clients.length} ${noun}, including inactive. ${sessionNote}`
            : `View /portal as one of ${clients.length} active client ${noun}. ${sessionNote}`
        }
        action={<ClientsActiveToggle basePath="/admin/settings/assume" searchParams={searchParams} showInactive={showInactive} />}
      />

      <div className="admin-card admin-section-card">
        <AssumeManager clients={clients} startAssumeSession={startAssumeSession} />
      </div>

      {mayTeam && (
        <div className="admin-card admin-section-card">
          <h2 className="admin-card-title u-mb-3">Team view</h2>
          <p className="admin-list-sub u-mb-3">
            See the Team pages exactly as one team member sees them, read-only, for {ASSUME_SESSION_MINUTES} minutes. Contractors are listed first.
          </p>
          {openTeam && (
            <div className="admin-banner-warn u-mb-3">
              <span>
                You are viewing the Team pages as <strong>{openTeam.name}</strong>.
              </span>
              <EndTeamAssumeButton endTeamAssume={endTeamAssume} label="End" may={mayProp(access, ["team.assume"])} />
            </div>
          )}
          <TeamAssumeList members={members} startTeamAssume={startTeamAssume} may={mayProp(access, ["team.assume"])} />
        </div>
      )}
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getAccess } from "@/kernel/identity/access-request";
import { getActorClientCompanies, getHubTabFlags } from "@/entities/team/lib/hub-clients";
import { PageHead } from "@/kernel/ui/PageHead";
import { HubTabs } from "./HubTabs";

// The client hub shell: one header + tab nav shared by Overview, Roadmap,
// Board, and Documents. Authorization happens here (the company must be in the
// actor's active assignments) AND again in every page's data fetch — the
// layout gate is UX, the data gates are the security boundary. The tab flags
// mirror the admin hub home: with programs present, Work Board and Roadmap are
// labeled company-wide, and both drop only under the guarded drop rule. The
// Weekly status tab shows when the viewer may open that page for this client
// (Z.12.2): the client's own team and Admin, asked with the company as target.

export default async function TeamClientHubLayout(
  props: {
    children: React.ReactNode;
    params: Promise<{ companyId: string }>;
  }
) {
  const params = await props.params;

  const {
    children
  } = props;

  const actor = await requireTeamMember();
  const [companies, flags, access] = await Promise.all([
    getActorClientCompanies(actor),
    getHubTabFlags(params.companyId),
    getAccess(),
  ]);
  const company = companies.find((c) => c.id === params.companyId);
  if (!company) notFound();

  return (
    <div>
      <PageHead
        eyebrow={<Link href="/team/clients">← My Clients</Link>}
        title={company.name}
        sub={company.roleTitle ? `Your role: ${company.roleTitle}` : "Client hub"}
      />
      <HubTabs
        base={`/team/clients/${company.id}`}
        hasPrograms={flags.hasPrograms}
        dropCompanyWide={flags.dropCompanyWide}
        showStatus={access?.may("client-programs.status", { company: company.id }) ?? false}
      />
      {children}
    </div>
  );
}

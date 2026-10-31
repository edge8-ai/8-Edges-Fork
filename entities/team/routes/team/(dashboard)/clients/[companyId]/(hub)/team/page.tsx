import { requirePermission } from "@/kernel/identity/access-request";
import { notFound } from "next/navigation";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getClientTeamForActor } from "@/entities/team/lib/hub-clients";
import { HubTeamPanel } from "@/entities/contacts";

export const metadata = { title: "Client Team" };

// The Team tab: both sides of the account, the Edge8 staff assigned to this
// client and the client's own contacts.
export default async function TeamClientTeamTab(props: { params: Promise<{ companyId: string }> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("team.clients");
  const params = await props.params;
  const actor = await requireTeamMember();
  const team = await getClientTeamForActor(actor, params.companyId);
  if (team === null) notFound();

  return <HubTeamPanel team={team} />;
}

import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { saigonToday } from "@/kernel/config/dates";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { getClientDigests } from "@/entities/team/lib/client-digest";
import { readShow } from "@/entities/team/lib/my-clients-view";
import { MyClients } from "@/entities/team/ui/MyClients";

export const metadata = {
  title: "My Clients",
};

// The team member's delivery view of their clients. It used to be the admin
// CRM table scoped to their assignments (industry, size, priority, date added),
// which answers nothing a delivery person asks. Each client now says what is
// waiting on them, what is being built and what shipped this week, and when
// we last met; the hub behind each card has the rest. The page head is the
// body's own, because its sentence is written from the digests (X.3).
export default async function TeamClientsPage(props: { searchParams: Promise<SearchParamsObj> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("team.clients");
  const actor = await requireTeamMember();
  const searchParams = await props.searchParams;
  const digests = await getClientDigests(actor);

  return <MyClients digests={digests} show={readShow(firstParam(searchParams.show))} today={saigonToday()} />;
}

import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { PageHead } from "@/kernel/ui/PageHead";
import { mayProp } from "@/kernel/identity/may-prop";
import { saigonToday } from "@/kernel/config/dates";
import { clientReviewClients, clientReviewFrameworks, openCycleProposal } from "@/entities/org/lib/client-reviews/proposal";
import { listCurrentTeamMembers } from "@/entities/org/lib/reviews/talent";
import { OpenCycleForm } from "./OpenCycleForm";

export const metadata = {
  title: "Open a client review",
  description: "Open a client review cycle: the client, the framework, who is reviewed, their client managers and the skip-manager.",
};

// A fixed list, because en-GB's Intl month names spell September "Sept".
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** This month in Saigon, "November 2026": what a cycle is usually called. */
function thisMonth(): string {
  const [year, month] = saigonToday().split("-");
  return `${MONTHS[Number(month) - 1]} ${year}`;
}

// /admin/talent/reviews/clients/new: opening a cycle from the app (CR.2.5,
// stories 1 to 3). Choosing a client reloads the page with what that client's
// placements propose, so the proposal is always read fresh on the server.
export default async function OpenClientCyclePage(props: { searchParams: Promise<{ client?: string }> }) {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("org.reviews");
  const may = mayProp(access, ["org.reviews"]);
  const { client } = await props.searchParams;
  const [clients, frameworks, team] = await Promise.all([clientReviewClients(), clientReviewFrameworks(), listCurrentTeamMembers()]);
  const chosen = clients.find((c) => c.id === client) ?? null;
  const proposal = chosen ? await openCycleProposal(chosen.id) : null;

  return (
    <div className="ats">
      <PageHead
        eyebrow={<Link href="/admin/talent/reviews/clients">Talent · Client reviews</Link>}
        title="Open a client review"
        sub="The client rates the people placed with them. Opening tells the members; nobody at the client hears from the app."
      />
      <OpenCycleForm
        // A new client is a new proposal, so the form starts over with it.
        key={chosen?.id ?? "none"}
        may={may}
        clients={clients}
        client={chosen}
        frameworks={frameworks}
        proposal={proposal}
        team={team}
        defaultName={thisMonth()}
      />
    </div>
  );
}

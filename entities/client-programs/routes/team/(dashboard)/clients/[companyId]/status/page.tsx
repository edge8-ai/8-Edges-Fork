import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { mayProp } from "@/kernel/identity/may-prop";
import { PageHead } from "@/kernel/ui/PageHead";
import { getActorClientCompanies } from "@/entities/team";
import { clientStatusReview } from "@/entities/client-programs/lib/client-status/review";
import { STATUS_EDIT_ATOM } from "@/entities/client-programs/lib/client-status/steps";
import { StatusReview } from "./StatusReview";

export const metadata = { title: "Weekly status" };

// The Weekly status page of a client (Z.12, spec §11; Z.12.1): this week's
// draft, the checks it passed and each line's source, with Edit the summary and
// Draft again; a stopped report shows its error and Use the plain report.
// Earlier weeks below.
//
// The draft is the account owner's (Khoa, 9 Oct 2026). They read it here, edit
// it, and share it with the client themselves. The page says so, and offers no
// approval, no release and no share control: nothing here sends the draft
// anywhere, and nothing about it appears in the Approvals inbox.
//
// It sits beside the client hub rather than inside it: the hub's layout opens
// only for the staff assigned to the client, and a holder of
// client-programs.status may have no assignment. So the page needs only its own
// atom and reads only the status of this one client; the rest of the hub stays
// closed to them, and an assigned viewer gets the way back to it.
//
// Since Z.12.2 (Khoa, 9 Oct 2026) the client's own team holds the atom at scope
// clients, so holding it is not enough: its reach must cover this company. An
// Admin's reaches every client; a team member's reaches the clients whose team
// they are on, and any other client's page is a 404 that reads nothing.

export default async function ClientWeeklyStatusPage(props: { params: Promise<{ companyId: string }> }) {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("client-programs.status");
  const { companyId } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(companyId)) notFound();
  if (!access.may("client-programs.status", { company: companyId })) notFound();
  const actor = await requireTeamMember();
  const [model, assigned] = await Promise.all([clientStatusReview(companyId), getActorClientCompanies(actor)]);
  if (!model) notFound();
  const inHub = assigned.some((c) => c.id === companyId);

  return (
    <>
      <PageHead
        eyebrow={inHub ? <Link href={`/team/clients/${companyId}`}>← {model.company} hub</Link> : "Client"}
        title={model.company}
        sub="Weekly status"
      />
      <StatusReview model={model} may={mayProp(access, [STATUS_EDIT_ATOM], { company: companyId })} />
    </>
  );
}

import { requirePermission } from "@/kernel/identity/access-request";
import { notFound } from "next/navigation";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getClientDocumentsForActor, getActorEmail } from "@/entities/team/lib/hub-clients";
import { ClientDocumentsList } from "../ClientDocumentsList";

export const metadata = { title: "Client Documents" };

// The Documents tab: the client's whole vault (same files as /portal/documents).
// Every document shows here, a program-tagged one with its program name; the
// Overview keeps the company-wide slice beside the program panels. Upload for
// any assigned team member; delete only what you uploaded.

export default async function TeamClientDocumentsTab(props: { params: Promise<{ companyId: string }> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("team.clients");
  const params = await props.params;
  const actor = await requireTeamMember();
  const [documents, actorEmail] = await Promise.all([
    getClientDocumentsForActor(actor, params.companyId),
    getActorEmail(actor),
  ]);
  if (documents === null) notFound();

  return (
    <section className="admin-card admin-section-card">
      <h2 className="admin-card-title u-mb-3">Documents</h2>
      <ClientDocumentsList documents={documents} companyId={params.companyId} actorEmail={actorEmail} />
    </section>
  );
}

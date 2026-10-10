import { requirePortalPermission } from "@/kernel/identity/access-request";
import { listActiveContractors } from "@/entities/portal/lib/client-work-requests";
import { PageHead } from "@/kernel/ui/PageHead";
import { NewRequestForm } from "./NewRequestForm";

export const metadata = {
  title: "New Project Request",
  description: "Brief a contractor on a project.",
};

export default async function NewPortalRequestPage() {
  const actor = await requirePortalPermission("surface.portal");
  const contractors = await listActiveContractors();
  const companies = actor.memberships
    .filter((m) => m.companyId)
    .map((m) => ({ id: m.companyId as string, name: m.companyName ?? "Your company" }));

  return (
    <>
      <PageHead
        eyebrow="Client Portal · Requests"
        title="New project request"
        sub="The contractor reviews your brief and sends back an estimate for your approval before any work starts."
      />
      <div className="admin-content--form">
        {contractors.length === 0 ? (
          <div className="admin-empty">
            No contractors are available right now — send a general request instead and the Edge8 team
            will line one up.
          </div>
        ) : companies.length === 0 ? (
          <div className="admin-empty">
            Your portal access isn&apos;t linked to a company yet — reply to your Edge8 contact to fix this.
          </div>
        ) : (
          <NewRequestForm contractors={contractors} companies={companies} />
        )}
      </div>
    </>
  );
}

import { requirePermission } from "@/kernel/identity/access-request";
import { listAssumableClients } from "@/entities/company-os/lib/portal-assume";
import { PageHead } from "@/kernel/ui/PageHead";
import { ASSUME_SESSION_MINUTES } from "@/kernel/identity/portal-auth";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { ClientsActiveToggle, startAssumeSession } from "@/entities/crm";
import { AssumeManager } from "./AssumeManager";

// Settings → Assume. View the client portal exactly as one of the active
// client companies would see it, without ever leaving your admin session.
// Matches the admin Clients list: active clients by default, with a toggle to
// reveal inactive companies.
export default async function AssumePage(props: { searchParams: Promise<SearchParamsObj> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("company-os.clients");
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
    </>
  );
}

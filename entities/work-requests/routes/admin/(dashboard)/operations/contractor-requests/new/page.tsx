import { requirePermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { listContractors } from "../../contractors/data";
import { NewRequestForm } from "./NewRequestForm";

export const metadata = {
  title: "New Work Request",
  description: "Send a work request to a contractor.",
};

export default async function NewWorkRequestPage(props: { searchParams: Promise<SearchParamsObj> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("company-os.operations");
  const searchParams = await props.searchParams;
  // Rates are fetched (any admin can raise a request) but only the hasRate
  // boolean ever reaches the client — the amounts stay server-side.
  const { rows, error } = await listContractors(true);
  const preselect = firstParam(searchParams.person);
  const contractors = rows
    .filter((r) => r.status === "active")
    .map((r) => ({ personId: r.person_id, label: r.display_name, hasRate: r.hourly_rate_cents !== null }));

  return (
    <>
      <PageHead
        eyebrow="Operations · Work Requests"
        title="New work request"
        sub="The contractor gets an email with a private link to estimate the work."
      />
      {error && <div className="admin-alert admin-alert--err u-mb-4">{error}</div>}
      <div className="admin-content--form">
        <NewRequestForm
          contractors={contractors}
          defaultPersonId={contractors.some((c) => c.personId === preselect) ? preselect : undefined}
        />
      </div>
    </>
  );
}

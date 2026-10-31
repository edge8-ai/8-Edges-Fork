import { redirect } from "next/navigation";
import { requirePermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { TAB_HREFS } from "@/entities/reimbursements/ui/ReimbursementTabs";

export const metadata = {
  title: "Reimbursements",
  description: "Where a viewer's work on reimbursement claims starts: the first of their tabs.",
};

// /admin/finance/reimbursements — the one Reimbursements row in the sidebar
// (RB.14). A nav row shows only to a viewer whose access reaches its page's
// declared permission, and the people who work claims hold different ones:
// a checker .check, the approver .approve, an admin .view. So this page asks
// only for the Admin view and sends each viewer to the first tab they may
// open: To check for a checker, To approve for the approver, All claims for an
// admin. Each tab keeps its own permission. A viewer who may open none is
// told so, here, rather than sent to a refusal.
export default async function ReimbursementsLandingPage() {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("surface.admin");
  const first = TAB_HREFS.find((t) => access.may(`reimbursements.${t.may}`));
  if (first) redirect(first.href);
  return <PageHead title="Reimbursements" sub="Your access does not include checking, approving or seeing claims. Ask a Super Admin if it should." />;
}

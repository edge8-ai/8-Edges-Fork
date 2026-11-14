import { saigonToday } from "@/kernel/config/dates";
import { requirePermission } from "@/kernel/identity/access-request";
import { isAdvanceTab } from "@/entities/reimbursements/lib/advance-books";
import { readAdvanceQueue } from "@/entities/reimbursements/lib/advance-queue";
import { AdvanceQueue } from "@/entities/reimbursements/ui/AdvanceQueue";
import { ReimbursementTabs, readTabsFor } from "@/entities/reimbursements/ui/ReimbursementTabs";

export const metadata = {
  title: "Reimbursements",
  description: "Every advance, read-only: who holds what, and where each one stands.",
};

// /admin/finance/reimbursements/advances: every advance, to help people (AD.12), beside the
// claims. Read-only, with no bank details. The decision and the transfer happen on the Team view.
export default async function AdminAdvancesPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("reimbursements.view");
  const tabs = await readTabsFor(access);
  const { tab } = await searchParams;
  return (
    <>
      <ReimbursementTabs active="advances" {...tabs} sub="Every advance, read-only. Decisions and transfers happen on the Team view." />
      <AdvanceQueue queue={await readAdvanceQueue()} showing={isAdvanceTab(tab) ? tab : "pay"} today={saigonToday()} base="/admin/finance/reimbursements/advances" />
    </>
  );
}

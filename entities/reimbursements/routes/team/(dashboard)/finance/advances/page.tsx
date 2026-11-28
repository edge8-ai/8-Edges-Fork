import { saigonToday } from "@/kernel/config/dates";
import { requirePermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { isAdvanceTab, previousMonth } from "@/entities/reimbursements/lib/advance-books";
import { readAdvanceQueue } from "@/entities/reimbursements/lib/advance-queue";
import { AdvanceQueue } from "@/entities/reimbursements/ui/AdvanceQueue";

export const metadata = {
  title: "Advances",
  description: "Every advance from request to closed: what to transfer, what is with people, and what is coming back.",
};

// /team/finance/advances: every advance that was ever asked for, for whoever records its
// money (AD.7), and the month's account 141.
export default async function AdvancesQueuePage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("reimbursements.pay");
  const { tab } = await searchParams;
  const today = saigonToday();

  return (
    <>
      <PageHead
        title="Advances"
        sub="Every advance from request to closed: what to transfer, what is with people, and what is coming back."
        action={
          <span className="u-row u-wrap u-gap-1 u-items-center">
            <span className="admin-hint">Export account 141:</span>
            {[today.slice(0, 7), previousMonth(today)].map((month) => (
              <a key={month} className="admin-btn admin-btn--sm" href={`/team/finance/advances/export?month=${month}`}>{month}</a>
            ))}
          </span>
        }
      />
      <AdvanceQueue queue={await readAdvanceQueue()} showing={isAdvanceTab(tab) ? tab : "pay"} today={today} base="/team/finance/advances" />
    </>
  );
}

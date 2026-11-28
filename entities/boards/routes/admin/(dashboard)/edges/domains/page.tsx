import { requirePermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { getWorkboard } from "@/entities/boards";
import { DomainsView } from "@/entities/boards/ui/DomainsView";
import { domainRows } from "@/entities/boards/ui/domain-rows";
import type { SearchParamsObj } from "@/kernel/ui/url";

export const metadata = {
  title: "Domains",
  description: "What is open in each domain of work, across every board.",
};

// Domains (W.53): the page that answers "what is open in Commerce & Billing"
// without picking a board first. It reads the same cross-board workboard every
// other Edges page reads, and the counting is epic-totals.ts run per board —
// the tested, person-free counter the per-board epics page already uses.
export default async function DomainsPage(props: { searchParams: Promise<SearchParamsObj> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("boards.open");
  const searchParams = await props.searchParams;
  const workboard = await getWorkboard({ scope: { kind: "all" } });
  const model = domainRows(workboard.boards, workboard.epics, workboard.cards);
  return (
    <>
      <PageHead eyebrow="8 Edges" title="Domains" sub="What is open in each domain of work, across every board." />
      <DomainsView model={model} searchParams={searchParams} />
    </>
  );
}

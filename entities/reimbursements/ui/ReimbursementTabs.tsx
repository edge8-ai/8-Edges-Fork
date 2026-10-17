// Reimbursements in Admin as one place with tabs (RB.14): To check, To
// approve, Ready to pay, Paid and All claims, each with how many it holds, in
// place of a row in the sidebar for each. A tab is a link to its own page, so
// each keeps its declared permission (ADR 0013) and its address: a viewer sees
// only the tabs whose pages they may open. Above them, when the next payment
// run is, and the month-end export for a payer.
import Link from "next/link";
import { PageHead } from "@/kernel/ui/PageHead";
import { formatDate } from "@/kernel/ui/format";
import type { RequestAccess } from "@/kernel/identity/access-request";
import { countQueues, type QueueCounts } from "../lib/check-queue";
import { nextRunDate } from "../lib/claim-rules";

export type ReimbursementTab = "to-check" | "to-approve" | "approved" | "paid" | "all";

const BASE = "/admin/finance/reimbursements";

type TabDef = { key: ReimbursementTab; label: string; href: string; count: keyof QueueCounts; may: "check" | "approve" | "view" };
const TABS: TabDef[] = [
  { key: "to-check", label: "To check", href: `${BASE}/to-check`, count: "toCheck", may: "check" },
  { key: "to-approve", label: "To approve", href: `${BASE}/to-approve`, count: "toApprove", may: "approve" },
  { key: "approved", label: "Ready to pay", href: `${BASE}/approved`, count: "readyToPay", may: "view" },
  { key: "paid", label: "Paid", href: `${BASE}/paid`, count: "paid", may: "view" },
  { key: "all", label: "All claims", href: `${BASE}/all`, count: "all", may: "view" },
];

/**
 * Where the landing page sends a viewer, in the order it tries: a checker's
 * work, then an approver's, then every claim for someone who only sees them.
 * Ready to pay and Paid are never where work starts.
 */
export const TAB_HREFS: { href: string; may: TabDef["may"] }[] = ["to-check", "to-approve", "all"].map((key) => {
  const t = TABS.find((x) => x.key === key)!;
  return { href: t.href, may: t.may };
});

export function ReimbursementTabs({
  active,
  counts,
  may,
  sub,
}: {
  active: ReimbursementTab;
  counts: QueueCounts;
  /** Which tabs' pages this viewer may open, and whether they pay (the export). */
  may: { check: boolean; approve: boolean; view: boolean; pay: boolean };
  /** One line under the title about the tab on show. */
  sub: string;
}) {
  const visible = TABS.filter((t) => may[t.may]);
  return (
    <>
      <PageHead
        title="Reimbursements"
        sub={sub}
        action={
          <span className="u-row u-wrap u-gap-2 u-items-center">
            <span className="admin-rb-nextrun">
              Next payment run <strong>{formatDate(nextRunDate(new Date().toISOString()))}</strong>
              {counts.readyToPay >= 0 ? ` · ${counts.readyToPay} approved` : ""}
            </span>
            {may.pay && (
              <Link href={`${BASE}/export`} className="admin-btn admin-btn--sm">
                Export month
              </Link>
            )}
          </span>
        }
      />
      <nav className="admin-tabs" aria-label="Claims by stage">
        {visible.map((t) => {
          const n = counts[t.count];
          return (
            <Link key={t.key} href={t.href} className={`admin-tab${t.key === active ? " is-active" : ""}`} aria-current={t.key === active ? "page" : undefined}>
              {t.label}
              {n >= 0 && <span className="admin-tab-count">{n}</span>}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

const UNCOUNTED: QueueCounts = { toCheck: -1, toApprove: -1, readyToPay: -1, paid: -1, all: -1 };

/** What the tabs show this viewer: the counts, and which tabs their access reaches. */
export type TabsFor = { counts: QueueCounts; may: { check: boolean; approve: boolean; view: boolean; pay: boolean } };

/**
 * The tabs' facts for one viewer, read by the page before it renders: the
 * counts (their own claims left out of the queues unless they may decide
 * them) and the tabs their access reaches.
 */
export async function readTabsFor(access: RequestAccess): Promise<TabsFor> {
  // A viewer with no person record reads nothing on a decider's page (their
  // own claims could not be left out of a count), so their tabs show none.
  const counts = access.personId ? await countQueues(access.personId, { includeOwn: access.may("reimbursements.decide-own") }) : UNCOUNTED;
  return {
    counts,
    may: {
      check: access.may("reimbursements.check"),
      approve: access.may("reimbursements.approve"),
      view: access.may("reimbursements.view"),
      pay: access.may("reimbursements.pay"),
    },
  };
}

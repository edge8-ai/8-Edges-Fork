import { requirePermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { DataTable, type Column } from "@/kernel/ui/DataTable";
import { noticeCounts, type NoticeCount } from "@/entities/company-os/lib/notice-counts";

export const metadata = {
  title: "Notices",
  description: "What Edge8 OS sends to Lark, and what the last 30 days sent, held and failed.",
};

// Settings → Notices (the Lark notifications plan, 2026-11-18). Answers "what
// are we sending" and "why did I get this": the few posts each office chat
// still carries, then the last 30 days of the message log per destination.
// Readable by whoever reads Settings → Agents.

const KEPT: { id: string; what: string; where: string; when: string }[] = [
  { id: "revenue", what: "Morning list: sales and marketing, each line naming who acts", where: "Revenue chat", when: "Weekdays 08:35; Wednesday opens with the weekly marketing report" },
  { id: "talent", what: "Morning list: applications, scorecards, stalled candidates", where: "Talent chat", when: "Weekdays 08:35" },
  { id: "ops", what: "Morning list: approvals, money, overdue cards, who is out", where: "Operations chat", when: "Weekdays 08:35; Monday adds the weekly Innovation report" },
  { id: "check-in", what: "Daily team check-in and weekly sprint planning", where: "Operations, Product and EO chats", when: "As today" },
  { id: "linkedin", what: "LinkedIn import reminder, only when last week is missing", where: "Direct message to LINKEDIN_IMPORTER_EMAIL", when: "Tuesday 08:35" },
  { id: "alerts", what: "Failed routines, the watchdog, tokens near expiry", where: "Direct message to each address in LARK_SYSTEM_ALERT_EMAILS", when: "As it happens" },
  { id: "dm", what: "Mentions, assignments, asks and 1-1 nudges", where: "Direct message to that person", when: "Working hours" },
];

type Kept = (typeof KEPT)[number];

const KEPT_COLUMNS: Column<Kept>[] = [
  { key: "what", header: "Message" },
  { key: "where", header: "Goes to" },
  { key: "when", header: "When" },
];

const COUNT_COLUMNS: Column<NoticeCount>[] = [
  { key: "destination", header: "Destination" },
  { key: "sent", header: "Sent", align: "right" },
  { key: "held", header: "Held", align: "right" },
  { key: "failed", header: "Failed", align: "right" },
  { key: "topSubjects", header: "Most common" },
];

export default async function NoticesPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission("company-os.agents");
  const [counts, searchParams] = await Promise.all([noticeCounts(), props.searchParams]);
  return (
    <>
      <PageHead
        eyebrow="Settings"
        title="Notices"
        sub="Each office chat gets one message a working day, where every line names a person and an action. Anything else sent to an office chat is held: never posted, but logged, and counted below."
      />
      <DataTable columns={KEPT_COLUMNS} rows={KEPT} total={KEPT.length} page={1} pageSize={KEPT.length} basePath="/admin/settings/notices" searchParams={searchParams} />
      <h2 className="admin-shelf-heading">Last 30 days</h2>
      <DataTable
        columns={COUNT_COLUMNS}
        rows={counts}
        total={counts.length}
        page={1}
        pageSize={Math.max(counts.length, 1)}
        basePath="/admin/settings/notices"
        searchParams={searchParams}
        emptyText="Nothing was sent to Lark in the last 30 days."
      />
    </>
  );
}

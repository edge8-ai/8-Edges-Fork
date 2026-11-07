// /team/quests/report (QS.3b; ADR 0020): who missed a Bounty, opened from the
// Team sidebar under Quests, as Khoa chose on 2026-10-28. It is the Admin
// view's report (/admin/talent/quests) for the managers who cannot enter the
// Admin view: only admins hold surface.admin, and before this page a manager
// could reach the report only by asking Claude. The rule of who appears lives
// in lib/quest-report.ts, shared with the Admin view and the assistant, so this
// page cannot widen it, and the sidebar shows its row only to someone who holds
// quests.report (the team layout keeps a row only when its page may be opened).
//
// With no quest asked for, the newest Bounty is shown, as on the Admin view.
import { requirePermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { readQuestReport, readReportQuests } from "@/entities/quests/lib/quest-report";
import { TeamQuestReportView } from "@/entities/quests/ui/TeamQuestReport";

export const metadata = { title: "Quest report", description: "One Bounty at a time: who of the people you manage missed it." };

const BASE = "/team/quests/report";

export default async function TeamQuestReportPage(props: { searchParams: Promise<SearchParamsObj> }) {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("quests.report");
  const searchParams = await props.searchParams;
  const options = await readReportQuests();
  const pickedId = firstParam(searchParams.quest)?.trim() || options[0]?.id || null;
  const report = pickedId ? await readQuestReport({ personId: access.personId, access }, pickedId) : null;
  // An admin reaches everyone, so the sentence about whom you see says so for them.
  const whom = access.roles.some((r) => r.role === "admin")
    ? "As an admin, you see everyone on it."
    : "You see the people who report to you, and everyone on a required Bounty you gave.";
  return (
    <div className="qs-page">
      <PageHead eyebrow={<span className="qs-tag">Quests · your team</span>} title="Who missed a Bounty" sub={`One Bounty at a time. ${whom} Speak with them privately; nothing here adds up across Bounties.`} />
      <TeamQuestReportView basePath={BASE} options={options} pickedId={pickedId} report={report} />
    </div>
  );
}

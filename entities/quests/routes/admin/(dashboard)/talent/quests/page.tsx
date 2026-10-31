// /admin/talent/quests (QS.3; ADR 0020): who missed a Bounty, as Khoa approved
// its prototype on 2026-10-27. Pick one Bounty and see, for each person you
// reach on it, their Standing on each head: Missed, Turned in late, Turned in,
// Accepted, Called or Handed back. A manager reaches their direct reports and
// everyone on a required Bounty they gave; an admin reaches everyone. The rule
// lives in lib/quest-report.ts, the read the assistant's per-quest question
// will share (QS.9), so this page cannot widen it. There is a quest picker and
// no person picker: every read is about one quest, and nothing here adds up a
// person's answers across quests.
//
// With no quest asked for, the newest Bounty is shown, so the page opens on
// something rather than on an empty prompt.
import { requirePermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { readQuestReport, readReportQuests } from "@/entities/quests/lib/quest-report";
import { QuestReportView } from "@/entities/quests/ui/QuestReport";

export const metadata = { title: "Who missed a Bounty", description: "One Bounty at a time: who of the people you manage missed it." };

const BASE = "/admin/talent/quests";

export default async function QuestReportPage(props: { searchParams: Promise<SearchParamsObj> }) {
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
    <>
      <PageHead eyebrow="Quests" title="Who missed a Bounty" sub={`One Bounty at a time. ${whom} Talk to them privately; nothing here adds up across Bounties.`} />
      <QuestReportView basePath={BASE} options={options} pickedId={pickedId} report={report} />
    </>
  );
}

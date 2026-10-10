import { requirePermission } from "@/kernel/identity/access-request";
import { redirect } from "next/navigation";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { PageHead } from "@/kernel/ui/PageHead";
import {
  canManageRoster,
  getCoachRoster,
  getDottedLine,
  getLarkConnection,
  getPastTeam,
  getPracticeFacts,
  getRosterCandidates,
  saigonToday,
} from "@/entities/coaching";
import { coachingMarkdownToHtml } from "@/entities/coaching/lib/markdown";
import { CoachRosterView } from "@/entities/coaching/ui/CoachRosterView";
import { LarkConnectLine } from "@/entities/coaching/ui/LarkConnectLine";
import {
  DottedLinePane,
  PastTeamPane,
  resolveTeamView,
  TeamTabBar,
  type DottedLinePaneRow,
} from "@/entities/coaching/ui/CoachTeamTabs";

export const metadata = {
  title: "Coaching",
  description: "Your coaching roster: the next 1-1 with each person, and where you can help.",
};

// /team/coaching — the page a coach opens before the week's 1-1s (K.46).
//
// Access is granted by coaching_profiles rows, not the manager role: a
// dotted-line coach sees exactly the people whose profile carries their
// coach_id, and nobody else (getCoachRoster injects the scope). Dotted Line
// shows only the sessions this person led (led_by), and Past Team only the
// profiles they coached. The markup is CoachRosterView's and CoachTeamTabs';
// this file is the guard and the loads.
export default async function CoachingDashboardPage(props: { searchParams?: Promise<{ view?: string; lark?: string }> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("coaching.roster");
  const actor = await requireTeamMember();
  const searchParams = await props.searchParams;
  const view = resolveTeamView(searchParams?.view);
  const [roster, dotted, past, lark] = await Promise.all([
    getCoachRoster(actor),
    getDottedLine(actor),
    getPastTeam(actor),
    getLarkConnection(actor),
  ]);
  // Managers with an empty roster still land here so they can add their
  // first person; everyone else with nobody on any tab has no business here.
  const manageable = await canManageRoster(actor);
  if (roster.length === 0 && dotted.length === 0 && past.length === 0 && !manageable) redirect("/team");

  const tabBar = (
    <>
      <LarkConnectLine connection={lark} status={searchParams?.lark ?? null} />
      <TeamTabBar active={view} counts={{ current: roster.length, dotted: dotted.length, past: past.length }} />
    </>
  );

  if (view === "current") {
    const today = saigonToday();
    // The practice tiles are built from the rows that have just been loaded plus
    // two reads of their own, so a tile can never disagree with the rows under it.
    const practice = await getPracticeFacts(roster, today);
    const candidates = manageable ? await getRosterCandidates(actor) : [];
    return <CoachRosterView roster={roster} candidates={candidates} practice={practice} today={today} tabBar={tabBar} />;
  }

  const dottedRows: DottedLinePaneRow[] =
    view === "dotted"
      ? await Promise.all(
          dotted.map(async (d) => ({
            profileId: d.profileId,
            name: d.member.name,
            relationship: d.relationship,
            coachName: d.coachName,
            sessions: await Promise.all(
              d.sessions.map(async (s) => ({
                id: s.id,
                heldOn: s.heldOn,
                goalsCheck: s.kind === "goals_check",
                html: s.summary?.trim() ? await coachingMarkdownToHtml(s.summary) : null,
              })),
            ),
          })),
        )
      : [];

  return (
    <div className="coach-page">
      <PageHead title="Your people" sub={view === "dotted" ? "Sessions you led with people someone else coaches" : "People you coached"} />
      {tabBar}
      {view === "dotted" ? <DottedLinePane rows={dottedRows} /> : <PastTeamPane rows={past} />}
    </div>
  );
}

import { requirePermission } from "@/kernel/identity/access-request";
import { mayProp } from "@/kernel/identity/may-prop";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getMyCoachingPage, saigonToday } from "@/entities/coaching";
import { cycleNeedingDraft } from "@/entities/coaching/lib/review-draft";
import { getMemberReviewHistory } from "@/entities/team";
import { MyCoachingView } from "@/entities/coaching/ui/MyCoachingView";
import { COMMITMENT_ROW_ATOMS } from "@/entities/coaching/lib/commitment-groups";
import { MyGoalsPanel } from "../goals/MyGoalsPanel";
import { PageHead } from "@/kernel/ui/PageHead";

export const metadata = {
  title: "My growth",
  description: "Your goal and the company bet it lifts, what you are working on, your next 1-1, and every conversation behind you.",
};

// /team/my-coaching - the member tier. getMyCoachingPage selects ONLY
// member-visible fields (goal, company goals, commitments, PUBLISHED recaps,
// check-ins); the private coaching tier never reaches this page's data.
//
// Two things are assembled HERE rather than in that module, both because a
// boundary rule pins them to a route body (A.11):
//
// The review cycle, because team requires coaching, so coaching may never
// import team, and a route body is the one place outside the door graph where
// that import is legal. The coach profile route does the same for the review
// history table.
//
// The My FAST goal tab renders the same MyGoalsPanel that /team/goals renders
// (spec 2.6, one form everywhere). It is composed HERE because the panel's
// server actions live under routes/ and ui/ may not import them; the view takes
// the rendered panel as a node.
export default async function MyCoachingPage(props: { searchParams?: Promise<{ tab?: string }> }) {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("coaching.mine");
  const searchParams = await props.searchParams;
  const actor = await requireTeamMember();
  const page = await getMyCoachingPage(actor);
  // No coaching profile yet. This page used to redirect to /team, so clicking
  // My Coach just bounced the person home with no word about why; it now says
  // plainly that nobody is set up as their coach yet (TH.7.2).
  if (!page) {
    return (
      <>
        <PageHead eyebrow="Coaching" title="My growth" />
        <div className="admin-empty">No coach is set up for you yet. Ask your manager or People &amp; Ops to set one up.</div>
      </>
    );
  }

  // Only `view` reaches the client component. `panel` stays here: its two
  // fields are what this route needs to build the goals panel, and they already
  // cross into the browser inside that panel's own props.
  const { view, panel } = page;

  const reviewCycle =
    cycleNeedingDraft(
      (await getMemberReviewHistory(actor.teamMemberId)).map((c) => ({ label: c.cycleLabel, status: c.status })),
    )?.label ?? null;

  return (
    <MyCoachingView
      page={view}
      teamMemberId={actor.teamMemberId}
      reviewCycle={reviewCycle}
      goalsPanel={
        <MyGoalsPanel
          rows={panel.goalRows}
          edges={panel.edges}
          coachName={view.my.coachName}
          todayISO={saigonToday()}
          may={mayProp(access, ["coaching.mine"])}
        />
      }
      initialTab={searchParams?.tab}
      may={mayProp(access, COMMITMENT_ROW_ATOMS)}
    />
  );
}

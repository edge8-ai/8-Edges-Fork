import { requirePermission } from "@/kernel/identity/access-request";
import { notFound } from "next/navigation";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getCoachProfileDetail, saigonToday } from "@/entities/coaching";
import { getMemberReviewHistory } from "@/entities/team";
import { coachingMarkdownToHtml } from "@/entities/coaching/lib/markdown";
import { CoachProfileHeader } from "@/entities/coaching/ui/CoachProfileHeader";
import { CoachProfileView, type RenderedHtml } from "@/entities/coaching/ui/CoachProfileView";
import { ReviewHistoryTable } from "@/entities/team/client";

export const metadata = { title: "Coaching" };

// /team/coaching/[profileId] — one person's coaching page: goal, cadence,
// commitments, every 1-1 (prep -> transcript -> two-tier summaries), private
// coaching reads, company goals, and monthly trends. getCoachProfileDetail returns null
// unless the actor is this profile's coach — that IS the authorization.
export default async function CoachProfilePage(
  props: {
    params: Promise<{ profileId: string }>;
    searchParams?: Promise<{ tab?: string }>;
  }
) {
  // The page's declared permission (ADR 0013).
  await requirePermission("coaching.roster");
  const searchParams = await props.searchParams;
  const params = await props.params;
  const actor = await requireTeamMember();
  const detail = await getCoachProfileDetail(actor, params.profileId);
  if (!detail) notFound();

  // One clock for the whole page: the header's date fields and the view's
  // carried-over dates both read this, so nothing on screen disagrees about
  // what today is and no date field resolves against the reader's own clock.
  const todayIso = saigonToday();

  // Fetched here (server), not in the coaching data layer, so lib/reviews'
  // server-only deps never get pulled into the client CoachProfileView bundle.
  const reviews = await getMemberReviewHistory(detail.member.teamMemberId);

  // Render every markdown field server-side once; the client edits raw
  // markdown and displays these.
  const html: RenderedHtml = { meetings: {}, trends: {}, checkins: {}, privateProfile: null };
  await Promise.all([
    ...detail.meetings.map(async (m) => {
      html.meetings[m.id] = {
        prep: m.prepMarkdown ? await coachingMarkdownToHtml(m.prepMarkdown) : null,
        summary: m.summaryMarkdown ? await coachingMarkdownToHtml(m.summaryMarkdown) : null,
        shared: m.sharedSummaryMarkdown ? await coachingMarkdownToHtml(m.sharedSummaryMarkdown) : null,
      };
    }),
    ...detail.trends.map(async (t) => {
      html.trends[t.id] = t.reportMarkdown ? await coachingMarkdownToHtml(t.reportMarkdown) : null;
    }),
    ...detail.checkins.map(async (c) => {
      html.checkins[c.id] = c.messageMarkdown ? await coachingMarkdownToHtml(c.messageMarkdown) : null;
    }),
    (async () => {
      html.privateProfile = detail.privateProfileMarkdown
        ? await coachingMarkdownToHtml(detail.privateProfileMarkdown)
        : null;
    })(),
  ]);

  return (
    // The coaching skin, shared with My Coach: Manrope card titles, softer
    // cards, the mint active tab, and the commitment board styling the
    // member's page has had since K.29 and the coach's never did. `coach-page`
    // is the coaching SKIN rather than one page's class — it now dresses both
    // sides of the same product, and the member-only selectors inside it
    // (the four-cell strip, the ring) simply do not match here.
    <div className="coach-page">
      <CoachProfileHeader detail={detail} todayIso={todayIso} />
      <CoachProfileView
        detail={detail}
        html={html}
        reviewCount={reviews.length}
        reviewHistory={<ReviewHistoryTable cycles={reviews} />}
        initialTab={searchParams?.tab}
        todayIso={todayIso}
      />
    </div>
  );
}

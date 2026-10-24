import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { ORG_NAME } from "@/kernel/config/organisation";
import { getMemberProfile } from "@/entities/team/lib/data";
import { PersonPostcard } from "@/entities/team/ui/PersonPostcard";
import { getCoachingProfileIdForMember, getEdgesLadderOptions, getTeamMemberActiveGoals } from "@/entities/coaching";
import { TeamGoalsEditor } from "@/entities/coaching";
import { initials } from "@/kernel/ui/format";
import type { DressedProfileSlot, PostcardStickersSlot } from "@/kernel/shell/page-slots";

export const metadata = {
  title: "Profile",
  description: "A team member's public profile.",
};

// /team/directory/[id] - a colleague's public profile. Company-visible like the
// directory and org chart, and limited to the same safe fields plus the
// get-to-know-you extras (hometown, education, hobbies). No contact details.
// Drawn as a postcard since OV.5; the fields are the ones it always showed.
//
// Dressed since LD.6: the dressedProfile page slot draws the banner, plaque,
// stats and display case this person chose to show, read-only and in the
// viewer's own game style, with the postcard and the FAST goals under its
// Postcard tab. Without ladders the page is the postcard alone, as it was.
export default async function MemberProfilePage(props: { params: Promise<{ id: string }>; dressedProfile: DressedProfileSlot; postcardStickers: PostcardStickersSlot; searchParams?: Promise<{ tab?: string | string[] }> }) {
  // The page's declared permission (entities/team/permissions.ts, ADR 0013).
  await requirePermission("team.directory");
  const params = await props.params;
  const actor = await requireTeamMember();
  const profile = await getMemberProfile(params.id);
  if (!profile) notFound();
  // FAST goals are Transparent by design: every team member sees everyone's
  // and can comment. Managers can add, edit, or delete goals right here.
  // The ladder options travel with the goals: the directory editor is the same
  // FastGoalForm as the member's page since K.13, and it picks a company key
  // result rather than forcing the ladder to none.
  // The badge stickers on their postcard (LD.7b): the first three of the
  // display case they chose, which is all of it a teammate may read, from
  // ladders through the page slot; none without ladders.
  const [goals, coachingProfileId, edges, badges] = await Promise.all([
    getTeamMemberActiveGoals(params.id),
    getCoachingProfileIdForMember(params.id),
    getEdgesLadderOptions(),
    props.postcardStickers ? props.postcardStickers({ personId: profile.personId }) : null,
  ]);
  const canManageGoals = actor.role === "manager" && Boolean(coachingProfileId);

  const Dressed = props.dressedProfile?.Teammate;
  const postcard = (
    <div className="tp-page">
      <PersonPostcard profile={profile} orgName={ORG_NAME} nameLevel={Dressed ? 2 : 1} badges={badges} />

      {(goals.length > 0 || canManageGoals) && coachingProfileId && (
        <section className="tp-goals" aria-labelledby="tp-goals-h">
          <div className="tp-goals-head">
            <span className="tp-goals-ico" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 21V4 M5 4h11l-2 4 2 4H5" />
              </svg>
            </span>
            <h2 className="tp-goals-h" id="tp-goals-h">FAST goals</h2>
          </div>
          <p className="tp-hint">
            Transparent by design: everyone&apos;s quarterly goals are visible to the whole team,
            and anyone can comment.
          </p>
          <TeamGoalsEditor profileId={coachingProfileId} goals={goals} edges={edges} canManage={canManageGoals} />
        </section>
      )}

      <p className="tp-backlink">
        <Link href="/team/org">← Back to the org chart</Link>
      </p>
    </div>
  );
  if (!Dressed) return postcard;
  const tabParam = (await props.searchParams)?.tab;
  // No handle: a teammate's GitHub login is not among the directory's fields,
  // and widening them waits on Khoa's ruling (LD.6 review). The owner sees theirs.
  const person = { name: profile.name, initials: initials(profile.name), handle: null, photoUrl: profile.avatarUrl };
  return <Dressed personId={profile.personId} person={person} postcard={postcard} tab={typeof tabParam === "string" ? tabParam : undefined} />;
}

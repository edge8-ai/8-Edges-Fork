import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getMemberProfile } from "@/entities/team/lib/data";
import { getCoachingProfileIdForMember, getEdgesLadderOptions, getTeamMemberActiveGoals } from "@/entities/coaching";
import { TeamGoalsEditor } from "@/entities/coaching";
import { formatDate, humanize } from "@/kernel/ui/format";
import { initials } from "@/kernel/ui/format";

export const metadata = {
  title: "Profile",
  description: "A team member's public profile.",
};

// /team/directory/[id] - a colleague's public profile. Company-visible like the
// directory and org chart, and limited to the same safe fields plus the
// get-to-know-you extras (hometown, education, hobbies). No contact details.
export default async function MemberProfilePage(props: { params: Promise<{ id: string }> }) {
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
  const [goals, coachingProfileId, edges] = await Promise.all([
    getTeamMemberActiveGoals(params.id),
    getCoachingProfileIdForMember(params.id),
    getEdgesLadderOptions(),
  ]);
  const canManageGoals = actor.role === "manager" && Boolean(coachingProfileId);

  const meta = [
    profile.fullName && profile.fullName !== profile.name ? profile.fullName : null,
    profile.positionTitle,
    profile.departmentName,
  ]
    .filter(Boolean)
    .join(" · ");
  const personal = !!(profile.hometown || profile.education || profile.hobbies.length);

  return (
    <div className="admin-team-profile">
      <div className="admin-team-profile-head">
        <div className="admin-avatar admin-avatar--display admin-avatar--xxl">
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- uploaded file of unknown size; next/image needs fixed dimensions
            <img src={profile.avatarUrl} alt={profile.name} />
          ) : (
            <span>{initials(profile.name)}</span>
          )}
        </div>
        <div className="admin-team-profile-head-text">
          <h1 className="admin-page-title">{profile.name}</h1>
          {meta && (
            <p className="admin-page-sub u-mt-1">
              {meta}
            </p>
          )}
        </div>
      </div>

      <div className="admin-team-profile-stack">
        <section className="admin-card admin-section-card">
          <h2 className="admin-card-title">Role</h2>
          <dl className="admin-kv">
            <dt>Position</dt>
            <dd>{profile.positionTitle || "-"}</dd>
            <dt>Department</dt>
            <dd>{profile.departmentName || "-"}</dd>
            <dt>Location</dt>
            <dd>{profile.workLocation || "-"}</dd>
            <dt>Manager</dt>
            <dd>
              {profile.managerId && profile.managerName ? (
                <Link href={`/team/directory/${profile.managerId}`}>{profile.managerName}</Link>
              ) : (
                profile.managerName || "-"
              )}
            </dd>
            <dt>Employment type</dt>
            <dd>{profile.employmentType ? humanize(profile.employmentType) : "-"}</dd>
            <dt>Start date</dt>
            <dd>{profile.startDate ? formatDate(profile.startDate) : "-"}</dd>
          </dl>
        </section>

        {(goals.length > 0 || canManageGoals) && coachingProfileId && (
          <section className="admin-card admin-section-card">
            <h2 className="admin-card-title">FAST goals</h2>
            <p className="admin-hint u-mt-0">
              Transparent by design: everyone&apos;s quarterly goals are visible to the whole team,
              and anyone can comment.
            </p>
            <TeamGoalsEditor profileId={coachingProfileId} goals={goals} edges={edges} canManage={canManageGoals} />
          </section>
        )}

        {personal && (
          <section className="admin-card admin-section-card">
            <h2 className="admin-card-title">Get to know {profile.name}</h2>
            <dl className="admin-kv">
              {profile.hometown && (
                <>
                  <dt>Hometown</dt>
                  <dd>{profile.hometown}</dd>
                </>
              )}
              {profile.education && (
                <>
                  <dt>Education</dt>
                  <dd>{profile.education}</dd>
                </>
              )}
              {profile.hobbies.length > 0 && (
                <>
                  <dt>Hobbies</dt>
                  <dd>{profile.hobbies.join(", ")}</dd>
                </>
              )}
            </dl>
          </section>
        )}

        <p className="admin-page-sub u-mb-0">
          <Link href="/team/org">← Back to the org chart</Link>
        </p>
      </div>
    </div>
  );
}

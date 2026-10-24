import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { ORG_NAME } from "@/kernel/config/organisation";
import { getMemberProfile, getOwnProfile, getOwnSensitive, type MemberProfile } from "@/entities/team/lib/data";
import { ProfileEditor } from "./ProfileEditor";
import type { ProfileInput } from "./actions";
import { saveOwnAvatar, saveOwnIdImage } from "./actions";
import { legalName } from "@/kernel/config/people-name";
import { initials } from "@/kernel/ui/format";
import type { DressedProfileSlot, PostcardStickersSlot } from "@/kernel/shell/page-slots";

export const metadata = {
  title: "My Profile",
  description: "Your details, contact info, and private records.",
};

const s = (v: string | null | undefined): string => v ?? "";

// /team/profile — the actor's own record only (TH.9). The postcard teammates
// see is the editor at the top; the details and the payroll, ID and address
// fields sit below it. Restricted PII (people_sensitive) is loaded here for the
// actor's OWN row only. Claims live on their own page (/team/claims) and are
// no longer repeated here.
//
// The page is dressed (LD.6): the banner, the plaque, the stats, the display
// case and the tabs come through the dressedProfile page slot, so team never
// names ladders, and today's page moves whole under the Postcard tab. The slot
// reads the signed-in reader itself and takes no id. A deployment without
// ladders passes null, and the page is the postcard alone, as it was.
export default async function TeamProfilePage(props: { dressedProfile: DressedProfileSlot; postcardStickers: PostcardStickersSlot; searchParams?: Promise<{ tab?: string | string[] }> }) {
  // The page's declared permission (entities/team/permissions.ts, ADR 0013).
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const tabParam = (await props.searchParams)?.tab;
  const tab = typeof tabParam === "string" ? tabParam : undefined;
  // The badge stickers on the postcard (LD.7b) are the first three of the
  // display case the actor chose, the same three teammates see, from ladders
  // through the page slot; none without ladders.
  const [profile, sensitive, member, badges] = await Promise.all([
    getOwnProfile(actor),
    getOwnSensitive(actor),
    getMemberProfile(actor.teamMemberId),
    props.postcardStickers ? props.postcardStickers({ personId: actor.personId }) : null,
  ]);

  if (!profile) {
    return (
      <div className="admin-alert admin-alert--err">
        Your employment record could not be loaded. Contact your admin.
      </div>
    );
  }

  const p = profile.person;
  const x = profile.extras;
  // The postcard as teammates see it (the directory's own read). Someone the
  // directory does not list yet is drawn from their own record instead.
  const card: MemberProfile = member ?? {
    id: actor.teamMemberId,
    personId: actor.personId,
    name: actor.displayName,
    fullName: legalName(p, null),
    avatarUrl: profile.avatarUrl,
    positionTitle: profile.positionTitle,
    departmentName: profile.departmentName,
    workLocation: profile.work_location,
    employmentType: profile.employment_type,
    startDate: profile.start_date,
    managerId: null,
    managerName: profile.managerName,
    hometown: x.hometown,
    education: x.education,
    hobbies: x.hobbies,
  };

  const initial: ProfileInput = {
    preferredName: s(p?.preferred_name),
    phone: s(p?.phone),
    personalEmail: s(x.personalEmail),
    emergencyContactName: s(p?.emergency_contact_name),
    emergencyContactPhone: s(p?.emergency_contact_phone),
    gender: s(p?.gender),
    dateOfBirth: s(sensitive?.date_of_birth),
    maritalStatus: s(sensitive?.marital_status),
    hometown: s(x.hometown),
    education: s(x.education),
    hobbies: x.hobbies,
    currentAddress: s(sensitive?.current_address),
    permanentAddress: s(sensitive?.permanent_address),
    bankName: s(sensitive?.bank_name),
    bankAccountNumber: s(sensitive?.bank_account_number),
    bankBranch: s(sensitive?.bank_branch),
    taxCode: s(sensitive?.tax_code),
    socialInsuranceNumber: s(sensitive?.social_insurance_number),
    nationalIdNumber: s(sensitive?.national_id_number),
    nationalIdIssueDate: s(sensitive?.national_id_issue_date),
    nationalIdIssuePlace: s(sensitive?.national_id_issue_place),
  };

  const Dressed = props.dressedProfile?.Own;
  const postcard = (
    <div className="pe-page">
      <div className="pe-head">
        <div>
          <p className="admin-eyebrow">Me</p>
          <p className="pe-title">Your profile</p>
          <p className="pe-lede">This is your postcard. Click any dashed field to change it.</p>
        </div>
        <a className="pe-link" href={`/team/directory/${actor.teamMemberId}`}>
          See it as teammates do
        </a>
      </div>
      <ProfileEditor
        initial={initial}
        card={card}
        orgName={ORG_NAME}
        workEmail={p?.email ?? null}
        avatarAction={saveOwnAvatar}
        hasIdFront={!!sensitive?.id_front_path}
        hasIdBack={!!sensitive?.id_back_path}
        idFrontAction={saveOwnIdImage.bind(null, "front")}
        idBackAction={saveOwnIdImage.bind(null, "back")}
        nameLevel={Dressed ? 2 : 1}
        badges={badges}
      />
    </div>
  );
  if (!Dressed) return postcard;
  // The postcard's own photo, as teammates see it, is the face on the plaque and the "Your photo" banner.
  return <Dressed person={{ name: card.name, initials: initials(card.name), handle: p?.github_login ?? null, photoUrl: card.avatarUrl }} postcard={postcard} tab={tab} />;
}

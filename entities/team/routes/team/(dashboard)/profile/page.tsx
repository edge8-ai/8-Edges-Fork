import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { ORG_NAME } from "@/kernel/config/organisation";
import { getMemberProfile, getOwnProfile, getOwnSensitive, type MemberProfile } from "@/entities/team/lib/data";
import { DetailsEditor, ProfileEditor } from "./ProfileEditor";
import type { ProfileInput } from "./actions";
import { saveOwnAvatar, saveOwnIdImage } from "./actions";
import { legalName } from "@/kernel/config/people-name";
import { formatDate, initials } from "@/kernel/ui/format";
import { Tabs } from "@/kernel/ui/Tabs";
import type { DressedProfileSlot, PostcardStickersSlot } from "@/entities/ladders";

export const metadata = {
  title: "My Profile",
  description: "Your details, contact info, and private records.",
};

const s = (v: string | null | undefined): string => v ?? "";

// /team/profile — the actor's own record only (TH.9). Two things are drawn
// here and never share a tab (LD.10): the postcard teammates see, which is
// its own editor, and My details, the contact, payroll, ID and address fields.
// Restricted PII (people_sensitive) is loaded here for the actor's OWN row
// only. Claims live on their own page (/team/claims).
//
// The page is dressed (LD.6, redrawn LD.10): the player card, the ranks, the
// showcase, the stats and the tabs come through the dressedProfile page slot,
// so team never names ladders; the slot decides, by the reader's game style,
// whether to draw them or the postcard view. It reads the signed-in reader
// itself and takes no id. A deployment without ladders passes null, and the
// page is the postcard view this file draws: Your profile, with the Postcard
// and My details tabs.
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
  // The page's h1 is the player card's name, or the Your profile heading, so
  // the postcard's name is always an h2.
  const postcard = (
    <div className="pe-page">
      <div className="pe-head">
        <p className="pe-lede">This is your postcard, as teammates see it. Click any dashed field to change it.</p>
        <a className="pe-link" href={`/team/directory/${actor.teamMemberId}`}>
          See it as teammates do
        </a>
      </div>
      <ProfileEditor initial={initial} card={card} orgName={ORG_NAME} avatarAction={saveOwnAvatar} nameLevel={2} badges={badges} />
    </div>
  );
  const details = (
    <div className="pe-page">
      <DetailsEditor
        initial={initial}
        workEmail={p?.email ?? null}
        hasIdFront={!!sensitive?.id_front_path}
        hasIdBack={!!sensitive?.id_back_path}
        idFrontAction={saveOwnIdImage.bind(null, "front")}
        idBackAction={saveOwnIdImage.bind(null, "back")}
      />
    </div>
  );
  if (!Dressed) {
    return (
      <div className="pe-shell">
        <div className="pe-shell-head">
          <p className="admin-eyebrow">Me</p>
          <h1 className="pe-title">Your profile</h1>
        </div>
        <div className="pe-shell-tabs">
          <Tabs
            tabs={[
              { key: "postcard", label: "Postcard", content: postcard },
              { key: "details", label: "My details", content: details },
            ]}
            initialKey={tab}
            syncParam="tab"
          />
        </div>
      </div>
    );
  }
  const facts = [
    card.positionTitle ? { label: "Role", value: card.positionTitle } : null,
    card.departmentName ? { label: "Team", value: card.departmentName } : null,
    card.startDate ? { label: "Joined", value: formatDate(card.startDate) } : null,
  ].filter((f) => f !== null);
  // The postcard's own photo, as teammates see it, is the face on the player card.
  return (
    <Dressed
      person={{ name: card.name, initials: initials(card.name), handle: p?.github_login ?? null, photoUrl: card.avatarUrl, facts }}
      postcard={postcard}
      details={details}
      tab={tab}
    />
  );
}

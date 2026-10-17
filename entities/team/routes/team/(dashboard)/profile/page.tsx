import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getOwnProfile, getOwnSensitive } from "@/entities/team/lib/data";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { AvatarUpload } from "@/entities/team/ui/AvatarUpload";
import { formatDate, humanize } from "@/kernel/ui/format";
import { ProfileEditor } from "./ProfileEditor";
import type { ProfileInput } from "./actions";
import { saveOwnAvatar, saveOwnIdImage } from "./actions";
import { saigonToday } from "@/kernel/config/dates";
import { legalName } from "@/kernel/config/people-name";
import type { ProfileClaimsSlot } from "@/kernel/shell/page-slots";

export const metadata = {
  title: "My Profile",
  description: "Your details, contact info, and private records.",
};

const s = (v: string | null | undefined): string => v ?? "";

// /team/profile — the actor's own record only. Employment is read-only; the
// Personal, Contact, and Private sections are all self-editable. Restricted PII
// (people_sensitive) is loaded here for the actor's OWN row only.
//
// `claimsPanel` is the plan's "Profile → Reimbursements" (RB.1): the member's
// own claims, drawn by the reimbursements entity through a page slot
// (kernel/shell/page-slots.ts), so team never names it and a deployment
// without reimbursements passes nothing.
export default async function TeamProfilePage({ claimsPanel: ClaimsPanel = null }: { claimsPanel?: ProfileClaimsSlot }) {
  // The page's declared permission (entities/team/permissions.ts, ADR 0013).
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const [profile, sensitive] = await Promise.all([getOwnProfile(actor), getOwnSensitive(actor)]);

  if (!profile) {
    return (
      <div className="admin-alert admin-alert--err">
        Your employment record could not be loaded. Contact your admin.
      </div>
    );
  }

  const p = profile.person;
  const x = profile.extras;
  const onProbation =
    profile.employmentStage === "probation" &&
    !!profile.probationEndsOn &&
    profile.probationEndsOn >= saigonToday();

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

  return (
    <div className="admin-team-profile">
      <div className="admin-team-profile-head">
        <AvatarUpload name={actor.displayName} avatarUrl={profile.avatarUrl} action={saveOwnAvatar} />
        <div className="admin-team-profile-head-text">
          <h1 className="admin-page-title">{actor.displayName}</h1>
          <p className="admin-page-sub u-mt-1">
            {[legalName(p, null), profile.positionTitle, p?.email].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="admin-team-profile-head-badges">
          {profile.status && <Badge tone={statusTone(profile.status)}>{humanize(profile.status)}</Badge>}
          {onProbation && (
            <span className="admin-team-probation-chip">Probation · ends {formatDate(profile.probationEndsOn!)}</span>
          )}
        </div>
      </div>

      <div className="admin-team-profile-stack">
        <section className="admin-card admin-section-card">
          <h2 className="admin-card-title">Employment</h2>
          <dl className="admin-kv">
            <dt>Department</dt>
            <dd>{profile.departmentName || "—"}</dd>
            <dt>Position</dt>
            <dd>{profile.positionTitle || "—"}</dd>
            <dt>Manager</dt>
            <dd>{profile.managerName || "—"}</dd>
            <dt>Employment type</dt>
            <dd>{profile.employment_type ? humanize(profile.employment_type) : "—"}</dd>
            <dt>Start date</dt>
            <dd>{profile.start_date ? formatDate(profile.start_date) : "—"}</dd>
          </dl>
          <p className="admin-page-sub u-mb-0">
            Managed by the company. Ask your admin to change these.
          </p>
        </section>

        <ProfileEditor
          initial={initial}
          hasIdFront={!!sensitive?.id_front_path}
          hasIdBack={!!sensitive?.id_back_path}
          idFrontAction={saveOwnIdImage.bind(null, "front")}
          idBackAction={saveOwnIdImage.bind(null, "back")}
        />

        {ClaimsPanel && <ClaimsPanel personId={actor.personId} />}
      </div>
    </div>
  );
}

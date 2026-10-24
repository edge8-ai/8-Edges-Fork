import Link from "next/link";
import { requirePermission } from "@/kernel/identity/access-request";
import { notFound } from "next/navigation";
import { companyOs } from "@/kernel/data/supabase";
import { PageHead } from "@/kernel/ui/PageHead";
import { MetricCard } from "@/kernel/ui/MetricCard";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { InvitePortalButton, portalStatusesFor, SensitiveDetails, getPeopleSensitive } from "@/entities/crm";
import { ContractStartForm } from "./ContractStartForm";
// Concrete files, not this entity's own door: all three are re-exported by the
// barrel, so importing it here would make the entity depend on itself.
import { listCustodyForPerson } from "@/entities/org/lib/equipment";
import { getSalaryHistory } from "@/entities/org/lib/compensation";
import { getPersonSurveyResponses } from "@/entities/org/lib/surveys";
import { AssignmentsBlock } from "@/entities/company-os";
import { CompensationSection } from "./CompensationSection";
import { adminSetPersonAvatar, saveSensitiveDetails, saveContractStartDate, saveSalaryChange } from "../actions";
import { SendReviewButton } from "./SendReviewButton";
import { TimeOffCard, type LeaveRow } from "./TimeOffCard";
import { EquipmentCard } from "./EquipmentCard";
import { SurveyResponsesCard } from "./SurveyResponsesCard";
import { loadInviteOptions } from "./invite-options";
import {
  getMemberReviewHistory, AvatarUpload, ReviewHistoryTable,
  computeNextReview,
  hasProbationReview,
  REVIEW_TYPE_LABEL,
} from "@/entities/team";
import { getAssignmentsForTeamMember, listAssignableCompanies } from "@/entities/contacts";
import { formatDate, humanize } from "@/kernel/ui/format";
import { selectTimeOff, listHolidayDatesCovering, formatNumber, getMemberLeave, hoursToDays } from "@/entities/time-off";
import { type NamedPerson, personName } from "@/kernel/config/people-name";

export const metadata = {
  title: "Team member",
  description: "Employment, leave policy, and time-off history for one team member.",
};

// Talent → Team member profile. Everything about one team member (employment,
// leave policy, schedule, balance, time-off history) in one place. Sourced from
// company_os.team_directory: no Contact 360 link. The name reads display_name first, as everywhere (S.16.20).
type DirectoryRow = NamedPerson & {
  id: string;
  person_id: string | null;
  email: string;
  auth_user_id: string | null;
  status: string | null;
  employee_number: string | null;
  employment_type: string | null;
  start_date: string | null;
  end_date: string | null;
  department_name: string | null;
  position_title: string | null;
  manager_name: string | null;
  team: string | null;
  location: string | null;
  leave_policy: string | null;
  work_schedule: string | null;
};

export default async function TeamMemberPage(props: { params: Promise<{ id: string }> }) {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("org.people");
  const params = await props.params;
  const [memberRes, leaveRes] = await Promise.all([
    companyOs.from("team_directory").select("*").eq("id", params.id).maybeSingle(),
    selectTimeOff("id, leave_type, status, start_date, end_date, is_half_day, days, reason")
      .eq("team_member_id", params.id)
      .order("start_date", { ascending: false })
      .limit(100),
  ]);

  const m = memberRes.data as DirectoryRow | null;
  if (!m) notFound();

  // Wages and personal records are atoms of their own, people.pay and
  // people.identity, which Super Admin holds by declaration (ADR 0014). A plain
  // admin never has the sensitive data fetched — not just hidden. Checked
  // server-side here.
  const canSeePII = access.may("people.identity");
  const canSeePay = access.may("people.pay");
  const canManageAccess = access.may("access.manage");

  // Everything below keys only on the now-known directory row (person_id /
  // auth_user_id / team member id) and nothing depends on anything else here, so
  // fire it all in one parallel wave instead of four serial ones. Survey
  // responses, avatar, and PII are person-keyed — skipped when there's no linked
  // person (nothing could be attributed to the row).
  const [surveyResponses, assignments, assignableCompanies, avatarRes, sensitive, portalStatusFor, cycleRes, salaryHistory, custody, reviewHistory, probationDone, leaveById, inviteOptions] =
    await Promise.all([
      m.person_id ? getPersonSurveyResponses(m.person_id) : Promise.resolve([]),
      getAssignmentsForTeamMember(m.id),
      listAssignableCompanies(),
      m.person_id
        ? companyOs
            .from("people")
            .select(
              canSeePII
                ? "avatar_url, graduated_from, emergency_contact_name, emergency_contact_phone, metadata"
                : "avatar_url, graduated_from, metadata",
            )
            .eq("id", m.person_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      canSeePII && m.person_id ? getPeopleSensitive(m.person_id) : Promise.resolve(null),
      portalStatusesFor([m.auth_user_id]),
      companyOs
        .from("team_members")
        .select("employment_stage, probation_ends_on, contract_start_date")
        .eq("id", params.id)
        .maybeSingle(),
      canSeePay ? getSalaryHistory(m.id) : Promise.resolve([]),
      m.person_id ? listCustodyForPerson(m.person_id) : Promise.resolve([]),
      getMemberReviewHistory(m.id),
      hasProbationReview(m.id),
      getMemberLeave([m.id]), loadInviteOptions(m.employment_type),
    ]);
  const cycle = cycleRes.data as {
    employment_stage: string | null;
    probation_ends_on: string | null;
    contract_start_date: string | null;
  } | null;
  const person = avatarRes.data as {
    avatar_url: string | null;
    graduated_from: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    metadata: Record<string, unknown> | null;
  } | null;
  const avatarUrl = person?.avatar_url ?? null;
  const portalStatus = portalStatusFor(m.auth_user_id);

  // Personal details collected at onboarding (mapped onto `people`). Restricted
  // PII stays in the Sensitive details card; this is the get-to-know-you slice.
  const funStuff = (person?.metadata?.fun_stuff ?? null) as
    | { interests?: unknown; note?: unknown }
    | null;
  const interests = funStuff?.interests;
  const hobbies = Array.isArray(interests) ? interests.filter((h): h is string => typeof h === "string") : [];
  const funFact = typeof funStuff?.note === "string" && funStuff.note.trim() ? funStuff.note : null;
  const graduatedFrom = person?.graduated_from || null;
  const emergencyContact = canSeePII
    ? [person?.emergency_contact_name, person?.emergency_contact_phone].filter(Boolean).join(" · ") || null
    : null;
  const hasPersonal = Boolean(graduatedFrom || emergencyContact || hobbies.length || funFact);

  const requests = (leaveRes.data ?? []) as unknown as LeaveRow[];
  const leaveHolidays = await listHolidayDatesCovering(requests.flatMap((r) => [r.start_date, r.end_date]));
  // Open custody periods are what actually matters at offboarding: anything
  // without a returned_at is still physically with this person.
  const heldNow = custody.filter((c) => !c.returned_at);
  const isLeaving = m.status === "notice" || m.status === "terminated" || m.status === "alumni";
  const name = personName(m);

  // Next scheduled review (informational estimate; the scheduler that actually
  // fires cycles is a later slice). Saigon "today" matches the probation cron.
  const todayISO = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const nextReview = computeNextReview({
    startDate: m.start_date ? m.start_date.slice(0, 10) : null,
    contractStartDate: cycle?.contract_start_date ? cycle.contract_start_date.slice(0, 10) : null,
    hasProbationReview: probationDone,
    todayISO,
  });
  const nextReviewOverdue = nextReview ? nextReview.date < todayISO : false;
  // Pre-select the send button on the soonest scheduled type, ad-hoc otherwise.
  const defaultReviewType = nextReview?.type ?? "adhoc";
  // Balance from the leave policy rules, the same figure History and /team show.
  const leave = leaveById.get(m.id) ?? null;
  const balance = leave?.balance ?? null;
  const leaveDays = (h: number) => formatNumber(hoursToDays(h, leave?.policy?.accrual.hoursPerDay ?? 8));

  return (
    <>
      <div className="u-row-top u-gap-4">
        {m.person_id && (
          <AvatarUpload
            name={name}
            avatarUrl={avatarUrl}
            action={adminSetPersonAvatar.bind(null, m.person_id)}
            size={60}
          />
        )}
        <div className="u-grow u-min-0">
          <PageHead
            eyebrow={<Link href="/admin/talent/team">← Team</Link>}
            title={name}
            sub={[m.position_title, m.email].filter(Boolean).join(" · ")}
            action={
              m.status ? <Badge tone={statusTone(m.status)}>{humanize(m.status)}</Badge> : undefined
            }
          />
        </div>
      </div>

      {balance && (
        <div className="admin-kpi-grid u-mb-5">
          <MetricCard
            label="Accrued"
            value={leaveDays(balance.accruedHours + balance.anchorHours + balance.adjustedHours)}
            sub="days so far this policy year"
          />
          <MetricCard label="Used" value={leaveDays(balance.usedHours)} sub="days taken" />
          <MetricCard label="Remaining" value={leaveDays(balance.remainingHours)} sub="days left" />
        </div>
      )}

      <div className="admin-360">
        <div>
          <div className="admin-card admin-section-card">
            <h2 className="admin-card-title">Employment</h2>
            <dl className="admin-kv">
              <dt>Team</dt>
              <dd>{m.team || "—"}</dd>
              <dt>Department</dt>
              <dd>{m.department_name || "—"}</dd>
              <dt>Position</dt>
              <dd>{m.position_title || "—"}</dd>
              <dt>Approver</dt>
              <dd>{m.manager_name || "—"}</dd>
              <dt>Employment type</dt>
              <dd>{m.employment_type ? humanize(m.employment_type) : "—"}</dd>
              <dt>Employee #</dt>
              <dd>{m.employee_number || "—"}</dd>
              <dt>Location</dt>
              <dd>{m.location || "—"}</dd>
              <dt>Start date</dt>
              <dd>{m.start_date ? formatDate(m.start_date) : "—"}</dd>
              {cycle?.employment_stage && (
                <>
                  <dt>Stage</dt>
                  <dd>{humanize(cycle.employment_stage)}</dd>
                </>
              )}
              {cycle?.probation_ends_on && (
                <>
                  <dt>Probation ends</dt>
                  <dd>{formatDate(cycle.probation_ends_on)}</dd>
                </>
              )}
              <dt>Contract start</dt>
              <dd>
                {/* Admin-editable: when the full-time labor contract begins. A
                    probation extension moves it +30 automatically; this is the
                    manual control. */}
                <ContractStartForm
                  action={saveContractStartDate.bind(null, m.id)}
                  defaultValue={cycle?.contract_start_date ?? ""}
                />
              </dd>
              {/* What this person holds lives in one place, Settings → Access
                  (AE.3): the module switches that used to sit here became
                  grants there. */}
              <dt>Access</dt>
              <dd>
                {m.person_id && canManageAccess ? (
                  <Link href={`/admin/settings/access?tab=people&person=${encodeURIComponent(m.person_id)}`}>See and change in Settings → Access</Link>
                ) : (
                  <span className="u-muted">Granted in Settings → Access</span>
                )}
              </dd>
              {m.end_date && (
                <>
                  <dt>End date</dt>
                  <dd>{formatDate(m.end_date)}</dd>
                </>
              )}
            </dl>
          </div>

          {hasPersonal && (
            <div className="admin-card admin-section-card">
              <h2 className="admin-card-title">Personal</h2>
              <dl className="admin-kv">
                {graduatedFrom && (
                  <>
                    <dt>Graduated from</dt>
                    <dd>{graduatedFrom}</dd>
                  </>
                )}
                {emergencyContact && (
                  <>
                    <dt>Emergency contact</dt>
                    <dd>{emergencyContact}</dd>
                  </>
                )}
                {hobbies.length > 0 && (
                  <>
                    <dt>Interests</dt>
                    <dd>{hobbies.join(", ")}</dd>
                  </>
                )}
                {funFact && (
                  <>
                    <dt>Fun fact</dt>
                    <dd>{funFact}</dd>
                  </>
                )}
              </dl>
            </div>
          )}

          <div className="admin-card admin-section-card">
            <h2 className="admin-card-title">Leave</h2>
            <dl className="admin-kv">
              <dt>Leave policy</dt>
              <dd>{m.leave_policy || "—"}</dd>
              <dt>Work schedule</dt>
              <dd>{m.work_schedule || "—"}</dd>
            </dl>
          </div>

          <div className="admin-card admin-section-card">
            <h2 className="admin-card-title">Portal access</h2>
            <p className="admin-page-sub u-mt-0">{m.email}</p>
            {!m.person_id ? (
              <span className="admin-cell-muted">No linked person record.</span>
            ) : m.status === "terminated" || m.status === "alumni" ? (
              // Past employees are never (re-)invited: show standing status only.
              <span className="admin-cell-muted">
                {portalStatus === "active" ? "Signed in" : portalStatus === "invited" ? "Invited, never signed in" : "Not invited"}
              </span>
            ) : (
              <InvitePortalButton teamMemberId={m.id} status={portalStatus} full {...inviteOptions} />
            )}
          </div>

          <AssignmentsBlock
            teamMemberId={m.id}
            assignments={assignments}
            companies={assignableCompanies}
          />
        </div>

        <div>
          <div className="admin-card admin-section-card">
            <h2 className="admin-card-title">Reviews ({reviewHistory.length})</h2>
            <dl className="admin-kv u-mb-4">
              <dt>Next review</dt>
              <dd>
                {nextReview ? (
                  <>
                    {REVIEW_TYPE_LABEL[nextReview.type]} · {formatDate(nextReview.date)}
                    {nextReviewOverdue && (
                      <>
                        {" "}
                        <Badge tone="warn">Overdue</Badge>
                      </>
                    )}
                  </>
                ) : (
                  <span className="admin-cell-muted">Set a start or contract date to schedule.</span>
                )}
              </dd>
            </dl>

            <div className={reviewHistory.length ? "u-mb-4" : undefined}>
              <SendReviewButton teamMemberId={m.id} defaultType={defaultReviewType} />
            </div>

            {reviewHistory.length > 0 && <ReviewHistoryTable cycles={reviewHistory} />}
          </div>

          <TimeOffCard requests={requests} leaveHolidays={leaveHolidays} />

          <EquipmentCard custody={custody} heldNow={heldNow} isLeaving={isLeaving} />

          <SurveyResponsesCard surveyResponses={surveyResponses} />

          {canSeePay && (
            <CompensationSection
              history={salaryHistory}
              startDate={m.start_date}
              action={saveSalaryChange.bind(null, m.id)}
            />
          )}
          {m.person_id && canSeePII && (
            <SensitiveDetails
              row={sensitive}
              hasIdFront={!!sensitive?.id_front_path}
              hasIdBack={!!sensitive?.id_back_path}
              idImageBaseHref={`/admin/talent/team/${m.id}/id-image`}
              selfieUrl={avatarUrl}
              action={saveSensitiveDetails.bind(null, m.person_id)}
            />
          )}
          {m.person_id && !canSeePII && (
            <div className="admin-card admin-section-card">
              <h2 className="admin-card-title">Sensitive details</h2>
              <p className="admin-cell-muted">Restricted — visible to finance-cleared admins only.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { one, type Embedded } from "@/kernel/config/embedded";
import { isUuid } from "@/kernel/config/slug";
import { NAME_COLUMNS, personName, type NamedPerson } from "@/kernel/config/people-name";
import type { SurveyFieldRow } from "../surveys-schema";
import { clientReviewSetting } from "./access";
import { raterFieldsOf } from "./skip-manager";
import { formSteps } from "../form-steps";
import { teamReviewView, type TeamReviewView, type ViewerRoles } from "./team-view-rules";

// The reader behind a client review on /team/reviews/[id] (CR.3.3, the
// member's side). It gathers one member's review in one cycle, works out who
// is asking, and hands both to ./team-view-rules, which asks the rules module
// what that viewer sees. Every read is a must-read: a failed read is an error,
// never a review that looks as if it were not there, or not yet released.

export type TeamClientReview = {
  cycleName: string;
  clientName: string | null;
  memberName: string;
  clientManagerName: string | null;
  /** The member's manager of record, for the 1-1 the review leads to. */
  managerName: string | null;
  /** Who released it, whose summary it is. */
  releasedByName: string | null;
  /** The framework's scale, in its own words. */
  scale: string | null;
  view: TeamReviewView;
};

/** Is this team member the coach of that one. Coaching answers it; org cannot import coaching (ADR 0025). */
type IsCoachOf = (coachTeamMemberId: string, teamMemberId: string) => Promise<boolean>;

type CycleExtra = {
  opened_at: string;
  companies: Embedded<{ name: string | null }>;
  review_frameworks: Embedded<{ rating_keys: string[] | null; rating_scale: string | null }>;
};

/**
 * The review the part with this id belongs to, as this viewer reads it, or
 * null when they read nothing of it (or there is no such client review).
 */
export async function teamClientReview(
  partId: string,
  viewer: {
    /** The session's team member, the one the coach is asked about. */
    teamMemberId: string;
    /**
     * Every team-member row of the viewer's person (./access, teamMemberIdsOf).
     * Being the member, or their manager of record, is judged on all of them:
     * the session names one row, and a person may hold several (the boundary
     * review on PR 2612).
     */
    ownTeamMemberIds: readonly string[];
    isReviewAdmin: boolean;
  },
  isCoachOf: IsCoachOf,
): Promise<TeamClientReview | null> {
  // The page asks here before the generic reader, which checks the id's shape
  // itself; an id that is not one must be a 404, never a failed query.
  if (!isUuid(partId)) return null;
  const setting = await clientReviewSetting(partId);
  if (!setting) return null;
  const memberId = await memberOf(partId);
  if (!memberId) return null;

  const [cycleRes, placeRes, memberRes] = await Promise.all([
    companyOs
      .from("review_cycles")
      .select("opened_at, companies:companies!company_id(name), review_frameworks:review_frameworks!framework_id(rating_keys, rating_scale)")
      .eq("id", setting.cycle.id)
      .limit(1),
    companyOs
      .from("review_cycle_members")
      .select("client_manager_person_id, hr_summary, released_by")
      .eq("cycle_id", setting.cycle.id)
      .eq("team_member_id", memberId)
      .limit(1),
    companyOs.from("team_members").select(`manager_id, people!person_id(${NAME_COLUMNS})`).eq("id", memberId).limit(1),
  ]);
  const cycle = mustRows(cycleRes, "[org/client-reviews] review_cycles")[0] as unknown as CycleExtra | undefined;
  const place = mustRows(placeRes, "[org/client-reviews] review_cycle_members")[0] as
    | { client_manager_person_id: string | null; hr_summary: string | null; released_by: string | null }
    | undefined;
  const member = mustRows(memberRes, "[org/client-reviews] team_members")[0] as unknown as
    | { manager_id: string | null; people: Embedded<NamedPerson> }
    | undefined;
  if (!cycle || !place || !member) return null;

  const own = new Set([viewer.teamMemberId, ...viewer.ownTeamMemberIds]);
  const isMember = own.has(memberId);
  const isManagerOfRecord = member.manager_id !== null && own.has(member.manager_id);
  // The coach is asked about last, and only when nothing wider is true: it is
  // another entity's read, and the answer changes nothing for anyone else.
  const roles: ViewerRoles = {
    isMember,
    isReviewAdmin: viewer.isReviewAdmin,
    isManagerOfRecord,
    isCoach: !isMember && !viewer.isReviewAdmin && !isManagerOfRecord && (await isCoachOf(viewer.teamMemberId, memberId)),
  };

  const framework = one(cycle.review_frameworks);
  const view = teamReviewView({
    facts: setting.facts,
    roles,
    openedAt: cycle.opened_at,
    raterFields: await raterFieldsOf(setting.cycle.frameworkId),
    ratingKeys: framework?.rating_keys ?? [],
    memberPart: setting.parts.member,
    clientManagerPart: setting.parts.clientManager,
    hrSummary: place.hr_summary,
    // Only the member reads the member's own wording; nobody else needs the read.
    memberTitles: isMember ? await memberTitlesOf(setting.cycle.frameworkId) : undefined,
  });
  if (!view) return null;

  const names = await peopleNames([
    view.dates.clientManagerSentAt ? place.client_manager_person_id : null,
    view.summary ? place.released_by : null,
  ]);
  return {
    cycleName: setting.cycle.name,
    clientName: one(cycle.companies)?.name ?? null,
    memberName: personName(one(member.people), "Team member"),
    clientManagerName: place.client_manager_person_id ? (names.get(place.client_manager_person_id) ?? null) : null,
    managerName: member.manager_id ? await teamMemberName(member.manager_id) : null,
    releasedByName: place.released_by ? (names.get(place.released_by) ?? null) : null,
    scale: framework?.rating_scale?.trim() || null,
    view,
  };
}

/** The member a client part is about; the setting read already proved the part is a client one. */
async function memberOf(partId: string): Promise<string | null> {
  const row = mustRows(
    await companyOs.from("performance_reviews").select("team_member_id").eq("id", partId).eq("review_type", "client").limit(1),
    "[org/client-reviews] performance_reviews",
  )[0] as { team_member_id: string } | undefined;
  return row?.team_member_id ?? null;
}

async function peopleNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
  if (!wanted.length) return new Map();
  const rows = mustRows(await companyOs.from("people").select(`id, ${NAME_COLUMNS}`).in("id", wanted), "[org/client-reviews] people") as unknown as (NamedPerson & { id: string })[];
  return new Map(rows.map((p) => [p.id, personName(p, "Unnamed")]));
}

async function teamMemberName(teamMemberId: string): Promise<string | null> {
  const row = mustRows(
    await companyOs.from("team_members").select(`people!person_id(${NAME_COLUMNS})`).eq("id", teamMemberId).limit(1),
    "[org/client-reviews] team_members",
  )[0] as unknown as { people: Embedded<NamedPerson> } | undefined;
  return row ? personName(one(row.people), null) : null;
}

/** The member's form's question wording, by the key each question's answer is stored under. */
async function memberTitlesOf(frameworkId: string): Promise<Map<string, string>> {
  const framework = mustRows(
    await companyOs.from("review_frameworks").select("member_survey_id").eq("id", frameworkId).limit(1),
    "[org/client-reviews] review_frameworks",
  )[0] as { member_survey_id: string | null } | undefined;
  if (!framework?.member_survey_id) return new Map();
  const fields = mustRows(
    await companyOs
      .from("survey_fields")
      .select("id, survey_id, position, type, label, help_text, required, config")
      .eq("survey_id", framework.member_survey_id)
      .order("position", { ascending: true }),
    "[org/client-reviews] survey_fields",
  ) as SurveyFieldRow[];
  const titles = new Map<string, string>();
  for (const [first] of formSteps(fields)) {
    const key = first.config?.maps_to;
    if (typeof key === "string") titles.set(key, first.label);
  }
  return titles;
}

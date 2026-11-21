import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { isUuid } from "@/kernel/config/slug";
import { businessDate, isTimeZone, monthDay } from "@/kernel/config/dates";
import { NAME_COLUMNS, personName, type NamedPerson } from "@/kernel/config/people-name";
import { factsFrom, PART_COLUMNS, wasReopened, type ClientPartRow, type CycleMemberRow, type CycleRow } from "./access";
import { isReviewedInCycle, ownerActionsOn, ownerScreenViewer, whatOwnerSees, type OwnerAction } from "./owner-rules";
import { memberEmailView, type MemberEmailView, type PlanColumns } from "./member-email-view";
import { averageOfRatings, isPartSubmitted, isSkipManagerLinkValid, memberStage, type ClientReviewStage } from "./rules";

// The cycle overview that replaces the owner's sheet (CR.2.3, story 10): the
// cycles, and for one cycle a row per member with their stage, their client
// manager, where each of the two parts stands, and both averages once they
// exist. It is read by review admins only (`org.reviews`), who see everything
// of a client review. The client managers' links are not on the rows: each
// manager has one link for all their members (CR.5.6), which the links card
// reads from ./manager-link-state through ./client-links (CR.5.7).
//
// Every read is a must-read: a failed read is an error on the page, never an
// empty table that would read as a cycle with nobody in it.

type Embedded<T> = T | T[] | null;
const one = <T>(v: Embedded<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** One cycle as the list of cycles shows it. */
export type ClientCycleSummary = {
  id: string;
  name: string;
  clientName: string | null;
  frameworkName: string | null;
  openedAt: string;
  closedAt: string | null;
  /** Members still in the cycle: a withdrawn member leaves the counts (CR.2.4). */
  members: number;
};

type CycleListRow = {
  id: string;
  name: string;
  opened_at: string;
  closed_at: string | null;
  companies: Embedded<{ name: string | null }>;
  review_frameworks: Embedded<{ name: string | null }>;
};

/** Every client review cycle, newest first. Any holder of the reviews permission sees a cycle a colleague opened. */
export async function listClientCycles(): Promise<ClientCycleSummary[]> {
  const cycles = mustRows(
    await companyOs
      .from("review_cycles")
      .select("id, name, opened_at, closed_at, companies:companies!company_id(name), review_frameworks:review_frameworks!framework_id(name)")
      .order("opened_at", { ascending: false }),
    "[org/client-reviews] review_cycles",
  ) as unknown as CycleListRow[];
  if (cycles.length === 0) return [];
  const members = mustRows(
    await companyOs.from("review_cycle_members").select("cycle_id").in("cycle_id", cycles.map((c) => c.id)).is("withdrawn_at", null),
    "[org/client-reviews] review_cycle_members",
  ) as { cycle_id: string }[];
  return cycles.map((c) => ({
    id: c.id,
    name: c.name,
    clientName: one(c.companies)?.name ?? null,
    frameworkName: one(c.review_frameworks)?.name ?? null,
    openedAt: c.opened_at,
    closedAt: c.closed_at,
    members: members.filter((m) => m.cycle_id === c.id).length,
  }));
}

/** One member's row on the overview. */
export type ClientOverviewRow = {
  teamMemberId: string;
  name: string;
  clientManagerName: string | null;
  stage: ClientReviewStage;
  /** Both averages exist only once that part is sent with every rating. */
  selfAverage: number | null;
  clientManagerAverage: number | null;
  /** The client manager's part, which the member's page and the row's actions act on. */
  clientManagerPartId: string | null;
  /** "Sent Nov 17", "Not sent", "Reopened, not sent again": where the member's own part stands. */
  memberPart: string;
  /** The same for the client manager's part, or "No client manager" when the member has none. */
  clientManagerPart: string;
  unlocked: boolean;
  /** The viewer is the member this row is about. */
  own: boolean;
  clientManagerPersonId: string | null;
  memberSent: boolean;
  clientManagerSent: boolean;
  released: boolean;
  /** Which of the owner's actions the rules allow on this row now (CR.2.4); none on the viewer's own row. */
  actions: Readonly<Record<OwnerAction, boolean>>;
};

export type ClientCycleOverview = {
  cycle: ClientCycleSummary;
  /** The client, whose contacts can be named client managers; null for a cycle with no client. */
  companyId: string | null;
  skipManagerName: string | null;
  /** Members the skip-manager has marked Reviewed, of the members still in the cycle. */
  skipReviewed: number;
  /** The skip-manager's link, whole, while it works; null otherwise, and for a viewer who is in the cycle (CR.3.2). */
  skipLink: string | null;
  skipLinkCopiedAt: string | null;
  skipLinkCancelled: boolean;
  /** The viewer is reviewed in this cycle (./owner-rules, isReviewedInCycle), so the skip-manager's card says why it shows them no link. */
  viewerInCycle: boolean;
  /** The day the parts are due, "YYYY-MM-DD" in the client's calendar, or null for no due date (CR.5.2). */
  dueDate: string | null;
  /** Whether the client has a time zone set: without one, the due day ends in Saigon (./due-date, clientToday). */
  clientHasTimeZone: boolean;
  /** The framework's two forms, opened in the form builder from the overview (CR.6); null where the framework names none. */
  forms: { memberSurveyId: string | null; raterSurveyId: string | null };
  rows: ClientOverviewRow[];
  /** The "Email the members" card: how and when the members are emailed, and how many have sent theirs (CR.5.4). */
  memberEmail: MemberEmailView;
};

type OverviewCycleRow = CycleRow & PlanColumns & {
  company_id: string | null;
  opened_at: string;
  skip_manager_token: string | null;
  skip_manager_link_copied_at: string | null;
  companies: Embedded<{ name: string | null; time_zone?: string | null; working_day_start?: string | null }>;
  review_frameworks: Embedded<{ name: string | null; rating_keys: string[] | null; member_survey_id: string | null; rater_survey_id: string | null }>;
};

type OverviewMemberRow = CycleMemberRow & { team_member_id: string; client_manager_person_id: string | null };

type PersonRow = NamedPerson & { id: string };

/**
 * The overview of one cycle, or null when there is no such cycle. `origin`
 * makes the skip-manager's link and the members' message whole, ready to
 * paste. A review admin who is themselves in the cycle reads their own row as
 * its member would: no client average, no sent dates and no actions (the
 * boundary reviews on PRs 2586 and 2612), and no skip-manager's link.
 */
export async function clientCycleOverview(cycleId: string, origin: string, viewerTeamMemberIds: readonly string[]): Promise<ClientCycleOverview | null> {
  if (!isUuid(cycleId)) return null;
  const cycle = mustRows(
    await companyOs
      .from("review_cycles")
      .select(
        "id, name, company_id, opened_at, closed_at, framework_id, skip_manager_person_id, skip_manager_token, skip_manager_link_copied_at, skip_manager_link_cancelled_at, due_date, member_email_mode, member_email_scheduled_at, member_email_sent_at, member_email_manual_marked_sent_at, companies:companies!company_id(name, time_zone, working_day_start), review_frameworks:review_frameworks!framework_id(name, rating_keys, member_survey_id, rater_survey_id)",
      )
      .eq("id", cycleId)
      .limit(1),
    "[org/client-reviews] review_cycles",
  )[0] as unknown as OverviewCycleRow | undefined;
  if (!cycle) return null;

  const [memberRes, partRes] = await Promise.all([
    companyOs
      .from("review_cycle_members")
      .select("team_member_id, client_manager_person_id, withdrawn_at, rater_unlocked_at, skip_waived_at, released_at")
      .eq("cycle_id", cycleId),
    companyOs.from("performance_reviews").select(PART_COLUMNS).eq("review_cycle_id", cycleId).eq("review_type", "client"),
  ]);
  const members = mustRows(memberRes, "[org/client-reviews] review_cycle_members") as OverviewMemberRow[];
  const parts = mustRows(partRes, "[org/client-reviews] performance_reviews") as ClientPartRow[];

  const personIds = [
    ...new Set([...members.map((m) => m.client_manager_person_id), cycle.skip_manager_person_id].filter((id): id is string => id !== null)),
  ];
  const [memberNameRes, personRes] = await Promise.all([
    members.length
      ? companyOs.from("team_members").select(`id, people!person_id(${NAME_COLUMNS})`).in("id", members.map((m) => m.team_member_id))
      : Promise.resolve({ data: [], error: null }),
    personIds.length ? companyOs.from("people").select(`id, ${NAME_COLUMNS}`).in("id", personIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const memberNames = new Map(
    (mustRows(memberNameRes, "[org/client-reviews] team_members") as unknown as { id: string; people: Embedded<NamedPerson> }[]).map((r) => [
      r.id,
      personName(one(r.people), "Team member"),
    ]),
  );
  const personNames = new Map((mustRows(personRes, "[org/client-reviews] people") as unknown as PersonRow[]).map((p) => [p.id, personName(p, "Unnamed")]));

  const ratingKeys = one(cycle.review_frameworks)?.rating_keys ?? [];
  const averageOf = (part: ClientPartRow | null) => (part && isPartSubmitted(part) ? averageOfRatings(part.ratings, ratingKeys) : null);
  const viewer = { ownTeamMemberIds: viewerTeamMemberIds };

  const rows = members
    .map((m): ClientOverviewRow => {
      const own = parts.filter((p) => p.team_member_id === m.team_member_id);
      const { facts, parts: byKind } = factsFrom(cycle, m, own);
      const cm = byKind.clientManager;
      // What this row may show the viewer is the rules' answer. On the
      // viewer's own row it is nothing of the client manager's part, no sent
      // date and no action: a review admin in the cycle reads their own review as
      // its member does (the boundary reviews on PRs 2586 and 2612).
      const sees = whatOwnerSees(ownerScreenViewer(m.team_member_id, viewer), "screen");
      return {
        teamMemberId: m.team_member_id,
        name: memberNames.get(m.team_member_id) ?? "Team member",
        clientManagerName: m.client_manager_person_id ? (personNames.get(m.client_manager_person_id) ?? null) : null,
        stage: memberStage(facts),
        selfAverage: sees.selfAverage ? averageOf(byKind.member) : null,
        clientManagerAverage: sees.clientManagerAverage ? averageOf(cm) : null,
        clientManagerPartId: cm?.id ?? null,
        memberPart: partCell(byKind.member, sees.sentDates),
        clientManagerPart: cm ? partCell(cm, sees.sentDates) : "No client manager",
        unlocked: m.rater_unlocked_at !== null,
        own: sees.own,
        clientManagerPersonId: m.client_manager_person_id,
        memberSent: isPartSubmitted(byKind.member),
        clientManagerSent: isPartSubmitted(cm),
        released: m.released_at !== null,
        // Nobody is offered an action on their own review; the commands refuse it too.
        actions: ownerActionsOn(facts, sees),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const stillIn = members.filter((m) => m.withdrawn_at === null);
  const skipReviewed = stillIn.filter((m) => isPartSubmitted(parts.find((p) => p.team_member_id === m.team_member_id && p.rater_kind === "skip_manager") ?? null)).length;
  // The skip-manager's link reaches every member, so a review admin who is in
  // the cycle gets none: it would open the client manager's part of their own
  // review before release (./owner-rules, isReviewedInCycle).
  const viewerInCycle = isReviewedInCycle(stillIn.map((m) => m.team_member_id), viewer);
  const skipLinkLive =
    cycle.skip_manager_token !== null &&
    isSkipManagerLinkValid({ closedAt: cycle.closed_at, hasSkipManager: cycle.skip_manager_person_id !== null, skipManagerLinkCancelled: cycle.skip_manager_link_cancelled_at !== null }, { tokenMatches: true }).ok;

  return {
    cycle: {
      id: cycle.id,
      name: cycle.name,
      clientName: one(cycle.companies)?.name ?? null,
      frameworkName: one(cycle.review_frameworks)?.name ?? null,
      openedAt: cycle.opened_at,
      closedAt: cycle.closed_at,
      members: stillIn.length,
    },
    companyId: cycle.company_id,
    skipManagerName: cycle.skip_manager_person_id ? (personNames.get(cycle.skip_manager_person_id) ?? null) : null,
    skipReviewed,
    skipLink: skipLinkLive && !viewerInCycle ? `${origin}${skipManagerLinkPath(cycle.id, cycle.skip_manager_token!)}` : null,
    skipLinkCopiedAt: cycle.skip_manager_link_copied_at,
    skipLinkCancelled: cycle.skip_manager_link_cancelled_at !== null,
    viewerInCycle,
    dueDate: cycle.due_date ?? null,
    clientHasTimeZone: isTimeZone(one(cycle.companies)?.time_zone),
    forms: {
      memberSurveyId: one(cycle.review_frameworks)?.member_survey_id ?? null,
      raterSurveyId: one(cycle.review_frameworks)?.rater_survey_id ?? null,
    },
    rows,
    memberEmail: memberEmailView(
      cycle,
      one(cycle.companies),
      stillIn.map((m) => {
        const self = parts.find((p) => p.team_member_id === m.team_member_id && p.rater_kind === "self") ?? null;
        return { name: memberNames.get(m.team_member_id) ?? "Team member", sentAt: isPartSubmitted(self) ? (self!.submitted_at ?? cycle.opened_at) : null };
      }),
      origin,
    ),
  };
}

/** The path of the skip-manager's link to a cycle: one page for every member, served by the portal (CR.3.2). */
export function skipManagerLinkPath(cycleId: string, token: string): string {
  return `/client-review/${cycleId}?t=${encodeURIComponent(token)}`;
}

/**
 * Where one part stands, in the table's words. The day it was sent shows
 * only when the viewer may see sent dates: not on their own review.
 */
export function partCell(part: ClientPartRow | null, withDate: boolean): string {
  if (part && isPartSubmitted(part)) return withDate && part.submitted_at ? `Sent ${monthDay(businessDate(part.submitted_at))}` : "Sent";
  return wasReopened(part) ? "Reopened, not sent again" : "Not sent";
}

import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { isUuid } from "@/kernel/config/slug";
import { one, type Embedded } from "@/kernel/config/embedded";
import { NAME_COLUMNS, personName, type NamedPerson } from "@/kernel/config/people-name";
import { formSteps } from "../form-steps";
import { PART_COLUMNS, factsFrom, type ClientPartRow, type CycleMemberRow, type CycleRow } from "./access";
import { memberAnswersBeside } from "./beside";
import { managerLinkOf, type ManagerLinkState } from "./manager-link-state";
import { ownerActionsOn, ownerScreenViewer, whatOwnerSees, type OwnerAction } from "./owner-rules";
import { averageOfRatings, isPartSubmitted, memberStage, type ClientReviewStage } from "./rules";
import { notesOf, raterFieldsOf } from "./skip-manager";
import type { SkipQuestion } from "./skip-rules";

// One member's client review as the person running the cycle reads it
// (CR.3.3, story 53): both parts side by side, both averages, the
// skip-manager's notes, the HR summary, and where the release stands. The
// reader is a review admin, who sees everything (./rules, whatViewerSees);
// the page that shows this is guarded by the reviews permission. A review
// admin who is the member gets nothing of it (./owner-rules, whatOwnerSees):
// their own review reaches them on the team side, as the visibility table
// allows.

/** One end of the previous/next pair on the member page. */
export type MemberStep = { teamMemberId: string; name: string };

/** Where a member sits in their cycle's list, and who is on either side of them. */
export type MemberNeighbours = { position: number; total: number; previous: MemberStep | null; next: MemberStep | null };

export type OwnerMemberPage =
  | { kind: "own" }
  | {
      kind: "page";
      cycle: { id: string; name: string; clientName: string | null; closed: boolean; hasSkipManager: boolean };
      /** Null when the member has withdrawn: they are not in the list the arrows walk. */
      neighbours: MemberNeighbours | null;
      member: { teamMemberId: string; name: string; managerName: string | null };
      clientManagerName: string | null;
      /** Whose link the row under "Where it is" is; null when the member has no client manager. */
      clientManagerPersonId: string | null;
      skipManagerName: string | null;
      stage: ClientReviewStage;
      memberSentAt: string | null;
      clientManagerSentAt: string | null;
      skipMarkedAt: string | null;
      skipWaivedAt: string | null;
      releasedAt: string | null;
      selfAverage: number | null;
      clientManagerAverage: number | null;
      /** How many of the rated questions the two parts rated differently, once both are sent. */
      ratedDifferently: number | null;
      /** Every question of the rater's form, with both answers and the skip-manager's note. */
      rows: SkipQuestion[];
      summary: string;
      actions: Readonly<Record<OwnerAction, boolean>>;
    };

type PageCycle = CycleRow & {
  companies: Embedded<{ name: string | null }>;
  review_frameworks: Embedded<{ rating_keys: string[] | null }>;
};

type PageMember = CycleMemberRow & { team_member_id: string; client_manager_person_id: string | null; hr_summary: string | null };

/**
 * Who is before and after `teamMemberId` among the cycle's members who are still
 * in it, in the order the cycle overview lists them (by name, ./overview). Null
 * when the member is not in that list. Two members with the same name keep the
 * order of their ids, so the walk is stable.
 */
export function memberNeighbours(members: readonly MemberStep[], teamMemberId: string): MemberNeighbours | null {
  const ordered = [...members].sort((a, b) => a.name.localeCompare(b.name) || a.teamMemberId.localeCompare(b.teamMemberId));
  const at = ordered.findIndex((m) => m.teamMemberId === teamMemberId);
  if (at < 0) return null;
  return { position: at + 1, total: ordered.length, previous: ordered[at - 1] ?? null, next: ordered[at + 1] ?? null };
}

/**
 * The page, `{ kind: "own" }` for the member themselves, or null when there is
 * no such member in the cycle. `viewerTeamMemberIds` is every team-member row
 * of the viewer's person (./access, teamMemberIdsOf), so a second engagement
 * is still them.
 */
export async function clientMemberPage(cycleId: string, teamMemberId: string, viewerTeamMemberIds: readonly string[]): Promise<OwnerMemberPage | null> {
  if (!isUuid(cycleId) || !isUuid(teamMemberId)) return null;
  // The rules decide whether this page opens for the viewer at all, before
  // anything is read: a review admin who is the member is shown none of it.
  const sees = whatOwnerSees(ownerScreenViewer(teamMemberId, { ownTeamMemberIds: viewerTeamMemberIds }), "screen");
  if (!sees.memberPage) return { kind: "own" };
  const [cycleRes, memberRes, partsRes, listRes] = await Promise.all([
    companyOs
      .from("review_cycles")
      .select("id, name, closed_at, framework_id, skip_manager_person_id, skip_manager_link_cancelled_at, companies:companies!company_id(name), review_frameworks:review_frameworks!framework_id(rating_keys)")
      .eq("id", cycleId)
      .limit(1),
    companyOs
      .from("review_cycle_members")
      .select("team_member_id, client_manager_person_id, withdrawn_at, rater_unlocked_at, skip_waived_at, released_at, hr_summary")
      .eq("cycle_id", cycleId)
      .eq("team_member_id", teamMemberId)
      .limit(1),
    companyOs.from("performance_reviews").select(PART_COLUMNS).eq("review_cycle_id", cycleId).eq("team_member_id", teamMemberId).eq("review_type", "client"),
    companyOs.from("review_cycle_members").select("team_member_id, withdrawn_at").eq("cycle_id", cycleId),
  ]);
  const cycle = mustRows(cycleRes, "[org/client-reviews] review_cycles")[0] as unknown as PageCycle | undefined;
  const member = mustRows(memberRes, "[org/client-reviews] review_cycle_members")[0] as PageMember | undefined;
  const parts = mustRows(partsRes, "[org/client-reviews] performance_reviews") as ClientPartRow[];
  if (!cycle || !member) return null;
  const stillIn = (mustRows(listRes, "[org/client-reviews] review_cycle_members") as { team_member_id: string; withdrawn_at: string | null }[]).filter((m) => m.withdrawn_at === null);

  const { facts, parts: byKind } = factsFrom(cycle, member, parts);
  const [fields, names, listNames] = await Promise.all([
    raterFieldsOf(cycle.framework_id),
    namesFor(teamMemberId, [member.client_manager_person_id, cycle.skip_manager_person_id]),
    namesOfMembers(stillIn.map((m) => m.team_member_id)),
  ]);
  const memberSent = isPartSubmitted(byKind.member);
  const cmSent = isPartSubmitted(byKind.clientManager);
  const memberBeside = memberSent ? memberAnswersBeside(fields, byKind.member) : {};
  const cmBeside = cmSent ? memberAnswersBeside(fields, byKind.clientManager) : {};
  const notes = notesOf(byKind.skipManager);
  const rows = formSteps(fields)
    .filter(([first]) => first.type !== "yes_no" && typeof first.config?.maps_to === "string")
    .map(([first]): SkipQuestion => {
      const key = first.config!.maps_to as string;
      return { key, title: first.label, member: memberBeside[first.id] ?? null, clientManager: cmBeside[first.id] ?? null, note: notes[key] ?? "" };
    });
  const rated = rows.filter((r) => r.member?.rating != null && r.clientManager?.rating != null);
  const ratingKeys = one(cycle.review_frameworks)?.rating_keys ?? [];

  return {
    kind: "page",
    cycle: { id: cycle.id, name: cycle.name, clientName: one(cycle.companies)?.name ?? null, closed: cycle.closed_at !== null, hasSkipManager: facts.cycle.hasSkipManager },
    neighbours:
      member.withdrawn_at === null
        ? memberNeighbours(stillIn.map((m) => ({ teamMemberId: m.team_member_id, name: listNames.get(m.team_member_id) ?? "Team member" })), teamMemberId)
        : null,
    member: { teamMemberId, name: names.member, managerName: names.manager },
    clientManagerName: member.client_manager_person_id ? (names.people.get(member.client_manager_person_id) ?? null) : null,
    clientManagerPersonId: member.client_manager_person_id,
    skipManagerName: cycle.skip_manager_person_id ? (names.people.get(cycle.skip_manager_person_id) ?? null) : null,
    stage: memberStage(facts),
    memberSentAt: memberSent ? (byKind.member?.submitted_at ?? null) : null,
    clientManagerSentAt: cmSent ? (byKind.clientManager?.submitted_at ?? null) : null,
    skipMarkedAt: isPartSubmitted(byKind.skipManager) ? (byKind.skipManager?.submitted_at ?? null) : null,
    skipWaivedAt: member.skip_waived_at,
    releasedAt: member.released_at,
    selfAverage: memberSent ? averageOfRatings(byKind.member?.ratings, ratingKeys) : null,
    clientManagerAverage: cmSent ? averageOfRatings(byKind.clientManager?.ratings, ratingKeys) : null,
    ratedDifferently: memberSent && cmSent ? rated.filter((r) => r.member!.rating !== r.clientManager!.rating).length : null,
    rows,
    summary: member.hr_summary ?? "",
    actions: ownerActionsOn(facts),
  };
}

/** The client manager's link row on the member page (CR.5.8): copy it, or why there is nothing to copy. */
export type ManagerLinkRow = {
  clientManagerPersonId: string;
  label: string;
} & ({ kind: "copy"; url: string; copiedAt: string | null } | { kind: "none"; why: string });

/**
 * How the row reads, from the link's state (./manager-link-state). The label
 * avoids a gendered pronoun, because the client's people are named, not sexed.
 * Null with no state: the member has no client manager, so there is no row.
 * `whereToIssue` says where a missing link is issued from: the cycle page,
 * unless the row is on that page already (the links card, CR.5.7).
 */
export function managerLinkRow(state: ManagerLinkState | null, managerName: string, cycleClosed: boolean, whereToIssue = "issue one from the cycle page"): ManagerLinkRow | null {
  if (!state) return null;
  const label = `${managerName}'s link, ${state.members === 1 ? "for their one member" : `for all ${state.members} of their members`}`;
  const base = { clientManagerPersonId: state.clientManagerPersonId, label };
  if (state.url) return { ...base, kind: "copy", url: state.url, copiedAt: state.copiedAt };
  if (state.cancelledAt) return { ...base, kind: "none", why: "Cancelled" };
  if (cycleClosed) return { ...base, kind: "none", why: "No link: the cycle is closed" };
  if (state.viewerReviewed) return { ...base, kind: "none", why: "No link for you: you are one of their members, so a colleague looks after it" };
  return { ...base, kind: "none", why: `No link yet: ${whereToIssue}` };
}

/**
 * The row for a page that answered `kind: "page"`. A separate read, called
 * after that answer, so the own-review answer still comes before any read.
 */
export async function memberManagerLinkRow(
  page: { cycle: { id: string; closed: boolean }; clientManagerPersonId: string | null; clientManagerName: string | null },
  origin: string,
  viewerTeamMemberIds: readonly string[],
): Promise<ManagerLinkRow | null> {
  if (!page.clientManagerPersonId) return null;
  const state = await managerLinkOf(page.cycle.id, page.clientManagerPersonId, origin, viewerTeamMemberIds);
  return managerLinkRow(state, page.clientManagerName ?? "The client manager", page.cycle.closed);
}

/**
 * The cycle's name and its client's, for the label of the back button on a
 * member's own page. It is a separate read, called after the page answered
 * `own`, so that answer still comes before any read (own-review-policy.test).
 */
export async function ownCycleLabel(cycleId: string): Promise<{ id: string; name: string; clientName: string | null } | null> {
  const res = await companyOs.from("review_cycles").select("id, name, companies:companies!company_id(name)").eq("id", cycleId).limit(1);
  const row = mustRows(res, "[org/client-reviews] review_cycles")[0] as unknown as { id: string; name: string; companies: Embedded<{ name: string | null }> } | undefined;
  return row ? { id: row.id, name: row.name, clientName: one(row.companies)?.name ?? null } : null;
}

/** The names of some team members, as the overview names them. */
async function namesOfMembers(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const res = await companyOs.from("team_members").select(`id, people!person_id(${NAME_COLUMNS})`).in("id", ids);
  const rows = mustRows(res, "[org/client-reviews] team_members") as unknown as { id: string; people: Embedded<NamedPerson> }[];
  return new Map(rows.map((r) => [r.id, personName(one(r.people), "Team member")]));
}

/** The member's name and their manager of record's, and the names of the client's people on the cycle. */
async function namesFor(teamMemberId: string, personIds: (string | null)[]): Promise<{ member: string; manager: string | null; people: Map<string, string> }> {
  const ids = [...new Set(personIds.filter((id): id is string => id !== null))];
  const [memberRes, peopleRes] = await Promise.all([
    companyOs.from("team_members").select(`manager_id, people!person_id(${NAME_COLUMNS})`).eq("id", teamMemberId).limit(1),
    ids.length ? companyOs.from("people").select(`id, ${NAME_COLUMNS}`).in("id", ids) : Promise.resolve({ data: [], error: null }),
  ]);
  const row = mustRows(memberRes, "[org/client-reviews] team_members")[0] as unknown as { manager_id: string | null; people: Embedded<NamedPerson> } | undefined;
  const people = mustRows(peopleRes, "[org/client-reviews] people") as unknown as (NamedPerson & { id: string })[];
  const manager = row?.manager_id
    ? (mustRows(
        await companyOs.from("team_members").select(`people!person_id(${NAME_COLUMNS})`).eq("id", row.manager_id).limit(1),
        "[org/client-reviews] team_members",
      )[0] as unknown as { people: Embedded<NamedPerson> } | undefined)
    : undefined;
  return {
    member: personName(one(row?.people), "Team member"),
    manager: manager ? personName(one(manager.people), null) : null,
    people: new Map(people.map((p) => [p.id, personName(p, "Unnamed")])),
  };
}

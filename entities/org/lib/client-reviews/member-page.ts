import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { isUuid } from "@/kernel/config/slug";
import { one, type Embedded } from "@/kernel/config/embedded";
import { NAME_COLUMNS, personName, type NamedPerson } from "@/kernel/config/people-name";
import { formSteps } from "../form-steps";
import { PART_COLUMNS, factsFrom, type ClientPartRow, type CycleMemberRow, type CycleRow } from "./access";
import { memberAnswersBeside } from "./beside";
import { ownerActionsOn, type OwnerAction } from "./owner-rules";
import { averageOfRatings, isPartSubmitted, memberStage, type ClientReviewStage } from "./rules";
import { notesOf, raterFieldsOf } from "./skip-manager";
import type { SkipQuestion } from "./skip-rules";

// One member's client review as the person running the cycle reads it
// (CR.3.3, story 53): both parts side by side, both averages, the
// skip-manager's notes, the HR summary, and where the release stands. The
// reader is a review admin, who sees everything (./rules, whatViewerSees);
// the page that shows this is guarded by the reviews permission. A review
// admin who is the member gets nothing of it: their own review reaches them
// on the team side, as the visibility table allows them.

export type OwnerMemberPage =
  | { kind: "own" }
  | {
      kind: "page";
      cycle: { id: string; name: string; clientName: string | null; closed: boolean; hasSkipManager: boolean };
      member: { teamMemberId: string; name: string; managerName: string | null };
      clientManagerName: string | null;
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
 * The page, `{ kind: "own" }` for the member themselves, or null when there is
 * no such member in the cycle. `viewerTeamMemberIds` is every team-member row
 * of the viewer's person (./access, teamMemberIdsOf), so a second engagement
 * is still them.
 */
export async function clientMemberPage(cycleId: string, teamMemberId: string, viewerTeamMemberIds: readonly string[]): Promise<OwnerMemberPage | null> {
  if (!isUuid(cycleId) || !isUuid(teamMemberId)) return null;
  if (viewerTeamMemberIds.includes(teamMemberId)) return { kind: "own" };
  const [cycleRes, memberRes, partsRes] = await Promise.all([
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
  ]);
  const cycle = mustRows(cycleRes, "[org/client-reviews] review_cycles")[0] as unknown as PageCycle | undefined;
  const member = mustRows(memberRes, "[org/client-reviews] review_cycle_members")[0] as PageMember | undefined;
  const parts = mustRows(partsRes, "[org/client-reviews] performance_reviews") as ClientPartRow[];
  if (!cycle || !member) return null;

  const { facts, parts: byKind } = factsFrom(cycle, member, parts);
  const [fields, names] = await Promise.all([raterFieldsOf(cycle.framework_id), namesFor(teamMemberId, [member.client_manager_person_id, cycle.skip_manager_person_id])]);
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
    member: { teamMemberId, name: names.member, managerName: names.manager },
    clientManagerName: member.client_manager_person_id ? (names.people.get(member.client_manager_person_id) ?? null) : null,
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

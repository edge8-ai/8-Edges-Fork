import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { one, type Embedded } from "@/kernel/config/embedded";
import { GREETING_COLUMNS, greetingName, personName, type GreetedPerson } from "@/kernel/config/people-name";
import { formSteps } from "../form-steps";
import { memberAnswersBeside } from "./beside";
import { isSkipManagerLinkValid, whatViewerSees, type LinkRefusal } from "./rules";
import { skipListStage, canSkipManagerWrite, type SkipListRow, type SkipQuestion } from "./skip-rules";
import { notesOf, raterFieldsOf, skipCycle, skipCycleRows, skipMemberFacts, type SkipCycle, type SkipMember, type ContactKey } from "./skip-manager";

// What the skip-manager's link shows (CR.3.2, stories 44 to 49), as the
// prototype approved on 13 Nov drew it: the list of every member and how far
// each has got, and one member with both parts side by side and a note beside
// each of the client manager's answers. Neither shows an average: the rules
// module keeps averages to the company's own readers (whatViewerSees).
//
// A link that does not work shows the same words however it failed, so a
// guessed or cancelled link learns nothing, not even the cycle's name.

export type { SkipListRow, SkipQuestion };

/** `skipManagerGreeting` is what the page calls them ("Hi Tim"), decided by the kernel's name rules. */
type Heading = { cycleName: string; clientName: string | null; skipManagerName: string; skipManagerGreeting: string };

export type SkipManagerView =
  | ({ kind: "list"; members: SkipListRow[] } & Heading)
  | ({
      kind: "member";
      teamMemberId: string;
      memberName: string;
      /** What the page calls the member ("Tâm's own answer"). */
      memberGreeting: string;
      clientManagerName: string | null;
      memberSentAt: string | null;
      clientManagerSentAt: string | null;
      questions: SkipQuestion[];
      /** Whether notes can still be written and the member marked: false once marked. */
      canWrite: boolean;
      reviewedAt: string | null;
      /** The next member ready for the skip-manager, to go on to after marking this one. */
      nextReady: { teamMemberId: string; name: string } | null;
    } & Heading)
  /** The member is not ready to open, or not in the cycle: the list says why. */
  | { kind: "not_ready" }
  | { kind: "closed"; cycleName: string; closedAt: string | null }
  | { kind: "no_longer_works" };

type Names = { members: Map<string, string>; memberGreetings: Map<string, string>; people: Map<string, string>; peopleGreetings: Map<string, string> };

async function namesOf(cycle: SkipCycle, members: SkipMember[]): Promise<Names> {
  const personIds = [...new Set([...members.map((m) => m.client_manager_person_id), cycle.skip_manager_person_id].filter((id): id is string => id !== null))];
  const [memberRes, peopleRes] = await Promise.all([
    members.length
      ? companyOs.from("team_members").select(`id, people!person_id(${GREETING_COLUMNS})`).in("id", members.map((m) => m.team_member_id))
      : Promise.resolve({ data: [], error: null }),
    personIds.length ? companyOs.from("people").select(`id, ${GREETING_COLUMNS}`).in("id", personIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const memberRows = mustRows(memberRes, "[org/client-reviews] team_members") as unknown as { id: string; people: Embedded<GreetedPerson> }[];
  const peopleRows = mustRows(peopleRes, "[org/client-reviews] people") as unknown as (GreetedPerson & { id: string })[];
  const members_ = new Map(memberRows.map((r) => [r.id, personName(one(r.people), "Team member")]));
  return {
    members: members_,
    memberGreetings: new Map(memberRows.map((r) => [r.id, greetingName(one(r.people), members_.get(r.id) ?? "Team member")])),
    people: new Map(peopleRows.map((p) => [p.id, personName(p, "Unnamed")])),
    peopleGreetings: new Map(peopleRows.map((p) => [p.id, greetingName(p, "there")])),
  };
}

/** The opening checks every view shares: the link, then the cycle's state. */
async function opened(cycleId: string, key: ContactKey): Promise<{ cycle: SkipCycle } | { refused: SkipManagerView }> {
  const found = await skipCycle(cycleId, key);
  if (!found) return { refused: { kind: "no_longer_works" } };
  const link = isSkipManagerLinkValid(
    // skipCycle has already set a cancelled link aside for the skip-manager signed in (CR.3.6).
    { closedAt: found.cycle.closed_at, hasSkipManager: found.cycle.skip_manager_person_id !== null, skipManagerLinkCancelled: found.cycle.skip_manager_link_cancelled_at !== null },
    { tokenMatches: found.tokenMatches },
  );
  if (!link.ok) return { refused: refusalView(found.cycle, link.reason) };
  return { cycle: found.cycle };
}

function refusalView(cycle: SkipCycle, reason: LinkRefusal): SkipManagerView {
  return reason === "cycle_closed" ? { kind: "closed", cycleName: cycle.name, closedAt: cycle.closed_at } : { kind: "no_longer_works" };
}

/** The skip-manager's list of every member still in the cycle, by name. */
export async function skipManagerList(cycleId: string, key: ContactKey): Promise<SkipManagerView> {
  const start = await opened(cycleId, key);
  if ("refused" in start) return start.refused;
  const { cycle } = start;
  const rows = await skipCycleRows(cycle.id);
  const names = await namesOf(cycle, rows.members);
  const members = rows.members
    .filter((m) => m.withdrawn_at === null)
    .map((m): SkipListRow => {
      const { facts, parts } = skipMemberFacts(cycle, rows, m.team_member_id)!;
      return {
        teamMemberId: m.team_member_id,
        name: names.members.get(m.team_member_id) ?? "Team member",
        clientManagerName: m.client_manager_person_id ? (names.people.get(m.client_manager_person_id) ?? null) : null,
        stage: skipListStage(facts),
        clientManagerSentAt: parts.clientManager?.status === "submitted" ? parts.clientManager.submitted_at : null,
        reviewedAt: parts.skipManager?.status === "submitted" ? parts.skipManager.submitted_at : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return { kind: "list", ...heading(cycle, names), members };
}

function heading(cycle: SkipCycle, names: Names): Heading {
  const id = cycle.skip_manager_person_id;
  return {
    cycleName: cycle.name,
    clientName: one(cycle.companies)?.name ?? null,
    skipManagerName: id ? (names.people.get(id) ?? "The skip-manager") : "The skip-manager",
    skipManagerGreeting: id ? (names.peopleGreetings.get(id) ?? "there") : "there",
  };
}

/** One member, both parts side by side, for the skip-manager to read and note. */
export async function skipManagerMember(cycleId: string, key: ContactKey, teamMemberId: string): Promise<SkipManagerView> {
  const start = await opened(cycleId, key);
  if ("refused" in start) return start.refused;
  const { cycle } = start;
  const rows = await skipCycleRows(cycle.id);
  const found = skipMemberFacts(cycle, rows, teamMemberId);
  if (!found) return { kind: "not_ready" };
  const sees = whatViewerSees(found.facts, { kind: "skip_manager_link", tokenMatches: true });
  if (!sees.clientManagerPart) return { kind: "not_ready" };

  const [fields, names] = await Promise.all([raterFieldsOf(cycle.framework_id), namesOf(cycle, rows.members)]);
  const memberBeside = sees.memberPart && found.parts.member?.status === "submitted" ? memberAnswersBeside(fields, found.parts.member) : {};
  const cmBeside = memberAnswersBeside(fields, found.parts.clientManager);
  const notes = sees.skipManagerComments ? notesOf(found.parts.skipManager) : {};
  const questions = formSteps(fields)
    .filter(([first]) => first.type !== "yes_no" && typeof first.config?.maps_to === "string")
    .map(([first]): SkipQuestion => {
      const key = first.config!.maps_to as string;
      return { key, title: first.label, member: memberBeside[first.id] ?? null, clientManager: cmBeside[first.id] ?? null, note: notes[key] ?? "" };
    });

  // The next member waiting on the skip-manager, so marking one leads to the next.
  const next = rows.members
    .filter((m) => m.team_member_id !== teamMemberId && m.withdrawn_at === null)
    .map((m) => ({ m, f: skipMemberFacts(cycle, rows, m.team_member_id)! }))
    .filter(({ f }) => skipListStage(f.facts) === "ready")
    .map(({ m }) => ({ teamMemberId: m.team_member_id, name: names.members.get(m.team_member_id) ?? "Team member" }))
    .sort((a, b) => a.name.localeCompare(b.name))[0];

  const skip = found.parts.skipManager;
  return {
    kind: "member",
    ...heading(cycle, names),
    teamMemberId,
    memberName: names.members.get(teamMemberId) ?? "Team member",
    memberGreeting: names.memberGreetings.get(teamMemberId) ?? "Team member",
    clientManagerName: found.member.client_manager_person_id ? (names.people.get(found.member.client_manager_person_id) ?? null) : null,
    memberSentAt: found.parts.member?.status === "submitted" ? found.parts.member.submitted_at : null,
    clientManagerSentAt: found.parts.clientManager?.submitted_at ?? null,
    questions,
    canWrite: canSkipManagerWrite(found.facts, { tokenMatches: true }).ok,
    reviewedAt: skip?.status === "submitted" ? skip.submitted_at : null,
    nextReady: next ?? null,
  };
}

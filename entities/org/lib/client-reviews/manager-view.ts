import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { isUuid } from "@/kernel/config/slug";
import { one, type Embedded } from "@/kernel/config/embedded";
import { GREETING_COLUMNS, NAME_ONLY_COLUMNS, greetingName, personName, type GreetedPerson, type NamedPerson } from "@/kernel/config/people-name";
import { reviewLinkPath } from "../reviews-labels";
import { factsFrom, PART_COLUMNS, tokenMatches, type ClientPartRow, type CycleMemberRow, type CycleRow } from "./access";
import { canClientManagerFillPart, type ClientReviewFacts } from "./rules";

// What a client manager's one link to a cycle shows (CR.5.6), as the
// ManagerHub prototype approved on 17 Nov drew it: every member they review in
// the cycle and where each stands, each opening that member's form. The form
// is the survey runner, reached with the part's own token, so the runner's
// rules decide what the form does; this page only lists.
//
// The credential is the link's token and nothing else. A link that does not
// work shows the same words however it failed (a wrong token, another cycle's
// token, a cancelled link, nobody left to review), so a guessed or cancelled
// link learns nothing, not even the cycle's name. A closed cycle is named, as
// on every other client review link, since the token proved who is asking.
//
// Every read is a must-read: a failed read is an error, never a link that
// looks as if it stopped working.

/** Where one member's review stands for their client manager. */
export type ManagerHubState = "not_started" | "in_progress" | "waiting" | "sent";

export type ManagerHubRow = {
  teamMemberId: string;
  name: string;
  state: ManagerHubState;
  /** When they sent it, once they have. */
  sentAt: string | null;
  /** The member's form under its own token, while the rules let them open it; null for a row still waiting on the member. */
  href: string | null;
};

export type ManagerHubView =
  | {
      kind: "list";
      cycleName: string;
      clientName: string | null;
      /** What the page calls them ("Hi Rosa"), decided by the kernel's name rules. */
      managerGreeting: string;
      /** The cycle's due date, a calendar day at the client, when one is set. */
      dueDate: string | null;
      rows: ManagerHubRow[];
    }
  | { kind: "closed"; cycleName: string; closedAt: string | null }
  | { kind: "no_longer_works" };

const NO: ManagerHubView = { kind: "no_longer_works" };

type HubCycle = CycleRow & { due_date: string | null; companies: Embedded<{ name: string }> };
type HubMember = CycleMemberRow & { team_member_id: string };

/**
 * One member's row, from the rules the form itself applies: the link's token
 * already matched, so what is left is whether the part is open, sent, or
 * waiting on the member. A part the rules refuse for another reason (none, or
 * cancelled on its own) is left off.
 */
export function hubRow(facts: ClientReviewFacts, part: ClientPartRow | null, name: string): ManagerHubRow | null {
  if (!part) return null;
  const answer = canClientManagerFillPart(facts, { tokenMatches: true });
  const base = { teamMemberId: part.team_member_id, name };
  if (answer.ok) return { ...base, state: part.status === "draft" ? "in_progress" : "not_started", sentAt: null, href: reviewLinkPath(part) };
  if (answer.reason === "already_submitted") return { ...base, state: "sent", sentAt: part.submitted_at, href: reviewLinkPath(part) };
  if (answer.reason === "not_yet") return { ...base, state: "waiting", sentAt: null, href: null };
  return null;
}

/** The page a client manager's link opens, for the token they presented. */
export async function managerHubView(cycleId: string, token: string | null): Promise<ManagerHubView> {
  if (!token || !isUuid(cycleId)) return NO;
  // Only this cycle's links are compared, in constant time each, so a token
  // from another cycle matches nothing here.
  const links = mustRows(
    await companyOs.from("review_cycle_manager_links").select("client_manager_person_id, access_token, cancelled_at").eq("cycle_id", cycleId),
    "[org/client-reviews] review_cycle_manager_links",
  ) as { client_manager_person_id: string; access_token: string; cancelled_at: string | null }[];
  const link = links.find((l) => tokenMatches(token, l.access_token));
  if (!link || link.cancelled_at) return NO;

  const cycle = mustRows(
    await companyOs
      .from("review_cycles")
      .select("id, name, closed_at, framework_id, skip_manager_person_id, skip_manager_link_cancelled_at, due_date, companies:companies!company_id(name)")
      .eq("id", cycleId)
      .limit(1),
    "[org/client-reviews] review_cycles",
  )[0] as unknown as HubCycle | undefined;
  if (!cycle) return NO;
  if (cycle.closed_at) return { kind: "closed", cycleName: cycle.name, closedAt: cycle.closed_at };

  const managerId = link.client_manager_person_id;
  const members = mustRows(
    await companyOs
      .from("review_cycle_members")
      .select("team_member_id, withdrawn_at, rater_unlocked_at, skip_waived_at, released_at")
      .eq("cycle_id", cycleId)
      .eq("client_manager_person_id", managerId)
      .is("withdrawn_at", null),
    "[org/client-reviews] review_cycle_members",
  ) as HubMember[];
  // A link that reaches nobody any more opens nothing.
  if (members.length === 0) return NO;
  const memberIds = members.map((m) => m.team_member_id);

  const [partsRes, namesRes, managerRes] = await Promise.all([
    companyOs.from("performance_reviews").select(PART_COLUMNS).eq("review_cycle_id", cycleId).eq("review_type", "client").in("team_member_id", memberIds),
    // Names only: a team member's address never reaches the client.
    companyOs.from("team_members").select(`id, people!person_id(${NAME_ONLY_COLUMNS})`).in("id", memberIds),
    companyOs.from("people").select(GREETING_COLUMNS).eq("id", managerId).limit(1),
  ]);
  const parts = mustRows(partsRes, "[org/client-reviews] performance_reviews") as ClientPartRow[];
  const names = new Map(
    (mustRows(namesRes, "[org/client-reviews] team_members") as unknown as { id: string; people: Embedded<NamedPerson> }[]).map((r) => [
      r.id,
      personName(one(r.people), "Team member"),
    ]),
  );
  const manager = (mustRows(managerRes, "[org/client-reviews] people") as unknown as GreetedPerson[])[0];

  const rows = members
    .flatMap((m) => {
      const { facts, parts: byKind } = factsFrom(cycle, m, parts.filter((p) => p.team_member_id === m.team_member_id));
      const row = hubRow(facts, byKind.clientManager, names.get(m.team_member_id) ?? "Team member");
      return row ? [row] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    kind: "list",
    cycleName: cycle.name,
    clientName: one(cycle.companies)?.name ?? null,
    managerGreeting: greetingName(manager ?? null, "there"),
    dueDate: cycle.due_date,
    rows,
  };
}

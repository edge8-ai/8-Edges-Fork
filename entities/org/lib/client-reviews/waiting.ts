import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { one, type Embedded } from "@/kernel/config/embedded";
import { NAME_ONLY_COLUMNS, personName, type NamedPerson } from "@/kernel/config/people-name";
import { reviewLinkPath } from "../reviews-labels";
import { activePortalMemberships, asSignedIn, factsFrom, membershipKey, PART_COLUMNS, type ClientPartRow, type CycleMemberRow, type CycleRow } from "./access";
import { canClientManagerFillPart, isPartSubmitted, type ClientReviewFacts } from "./rules";
import { skipManagerList } from "./skip-view";

// The portal home's "Reviews waiting on you" card (CR.3.6): what a client
// contact signed in to the portal has to do in the open client reviews. A
// client manager sees the members they are client manager for; a
// skip-manager sees the cycles they are skip-manager of. Anyone else sees
// nothing, and nothing here is sent to anyone: the card is there when they
// sign in.
//
// Each row is judged by the rules the form itself uses, through the same
// signed-in facts (asSignedIn), so the card never offers a part the form
// would then refuse, and the skip-manager's counts come from their own page's
// list, not from a second reading of the rows.

/** Where one member's review stands for their client manager. */
export type WaitingState = "ready" | "waiting" | "sent";

export type ClientManagerRow = {
  reviewId: string;
  name: string;
  state: WaitingState;
  /** Whether the member has sent their own part, which decides the wording of a ready row. */
  memberSent: boolean;
  /** When the client manager sent theirs, once they have. */
  sentAt: string | null;
  /** The form, for a part open to them now; the other rows are not links. */
  href: string | null;
};

export type ClientManagerCycle = { cycleId: string; cycleName: string; rows: ClientManagerRow[] };

export type SkipManagerCycle = { cycleId: string; cycleName: string; people: number; ready: number; reviewed: number; href: string };

export type ReviewsWaiting = { clientManager: ClientManagerCycle[]; skipManager: SkipManagerCycle[] };

/**
 * Where a client manager's part stands for them signed in, or null when the
 * rules give them nothing to see (a closed cycle, a withdrawn member, a part
 * that does not exist).
 */
export function clientManagerState(facts: ClientReviewFacts): WaitingState | null {
  const answer = canClientManagerFillPart(asSignedIn(facts), { tokenMatches: true });
  if (answer.ok) return "ready";
  if (answer.reason === "already_submitted") return "sent";
  if (answer.reason === "not_yet") return "waiting";
  return null;
}

type MemberRow = CycleMemberRow & { cycle_id: string; team_member_id: string; client_manager_person_id: string };

/** The open client reviews waiting on these people, a sign-in's people rows. */
export async function reviewsWaitingFor(personIds: readonly string[]): Promise<ReviewsWaiting> {
  if (personIds.length === 0) return { clientManager: [], skipManager: [] };
  const [clientManager, skipManager] = await Promise.all([clientManagerCycles(personIds), skipManagerCycles(personIds)]);
  return { clientManager, skipManager };
}

async function clientManagerCycles(personIds: readonly string[]): Promise<ClientManagerCycle[]> {
  const members = mustRows(
    await companyOs
      .from("review_cycle_members")
      .select("cycle_id, team_member_id, client_manager_person_id, withdrawn_at, rater_unlocked_at, skip_waived_at, released_at")
      .in("client_manager_person_id", [...personIds])
      .is("withdrawn_at", null),
    "[org/client-reviews] review_cycle_members",
  ) as MemberRow[];
  if (members.length === 0) return [];

  const cycleIds = [...new Set(members.map((m) => m.cycle_id))];
  const memberIds = [...new Set(members.map((m) => m.team_member_id))];
  const [cycleRes, partRes, nameRes, memberships] = await Promise.all([
    companyOs
      .from("review_cycles")
      .select("id, name, opened_at, closed_at, framework_id, skip_manager_person_id, skip_manager_link_cancelled_at, company_id")
      .in("id", cycleIds)
      .is("closed_at", null),
    companyOs.from("performance_reviews").select(`${PART_COLUMNS}, review_cycle_id`).in("review_cycle_id", cycleIds).in("team_member_id", memberIds).eq("review_type", "client"),
    companyOs.from("team_members").select(`id, people!person_id(${NAME_ONLY_COLUMNS})`).in("id", memberIds),
    activePortalMemberships(personIds),
  ]);
  const cycles = mustRows(cycleRes, "[org/client-reviews] review_cycles") as (CycleRow & { opened_at: string; company_id: string | null })[];
  const parts = mustRows(partRes, "[org/client-reviews] performance_reviews") as (ClientPartRow & { review_cycle_id: string })[];
  const names = new Map(
    (mustRows(nameRes, "[org/client-reviews] team_members") as unknown as { id: string; people: Embedded<NamedPerson> }[]).map((r) => [
      r.id,
      personName(one(r.people), "Team member"),
    ]),
  );

  return cycles
    .sort((a, b) => b.opened_at.localeCompare(a.opened_at))
    .map((cycle): ClientManagerCycle => {
      // Only where the person the member names holds portal access at the
      // cycle's own client, as the form itself asks (signedInAt).
      const rows = members
        .filter((m) => m.cycle_id === cycle.id && cycle.company_id !== null && memberships.has(membershipKey(m.client_manager_person_id, cycle.company_id)))
        .flatMap((m): ClientManagerRow[] => {
          const own = parts.filter((p) => p.review_cycle_id === cycle.id && p.team_member_id === m.team_member_id);
          const { facts, parts: byKind } = factsFrom(cycle, m, own);
          const state = clientManagerState(facts);
          const part = byKind.clientManager;
          if (!state || !part) return [];
          return [
            {
              reviewId: part.id,
              name: names.get(m.team_member_id) ?? "Team member",
              state,
              memberSent: isPartSubmitted(facts.parts.member),
              sentAt: state === "sent" ? part.submitted_at : null,
              // The form without a token: signing in is the way in here.
              href: state === "ready" ? reviewLinkPath({ ...part, access_token: null }) : null,
            },
          ];
        })
        .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.name.localeCompare(b.name));
      return { cycleId: cycle.id, cycleName: cycle.name, rows };
    })
    .filter((c) => c.rows.length > 0);
}

/** Ready first, since those are what the card is for; then waiting; then sent. */
const STATE_ORDER: Record<WaitingState, number> = { ready: 0, waiting: 1, sent: 2 };

async function skipManagerCycles(personIds: readonly string[]): Promise<SkipManagerCycle[]> {
  const cycles = mustRows(
    await companyOs
      .from("review_cycles")
      .select("id, opened_at")
      .in("skip_manager_person_id", [...personIds])
      .is("closed_at", null)
      .order("opened_at", { ascending: false }),
    "[org/client-reviews] review_cycles",
  ) as { id: string }[];
  // The skip-manager's own list, read as they would read it signed in, so the
  // counts are the page's. A cycle the list refuses is left off the card.
  const views = await Promise.all(cycles.map((c) => skipManagerList(c.id, { token: null, personIds })));
  return views.flatMap((view, i): SkipManagerCycle[] =>
    view.kind === "list"
      ? [
          {
            cycleId: cycles[i].id,
            cycleName: view.cycleName,
            people: view.members.length,
            ready: view.members.filter((m) => m.stage === "ready").length,
            reviewed: view.members.filter((m) => m.stage === "reviewed").length,
            href: `/client-review/${cycles[i].id}`,
          },
        ]
      : [],
  );
}

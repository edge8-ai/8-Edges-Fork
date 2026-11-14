import { companyOs, type Json } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { isUuid } from "@/kernel/config/slug";
import { NAME_COLUMNS, personName, type NamedPerson } from "@/kernel/config/people-name";
import { reviewLinkPath } from "../reviews-labels";
import { factsFrom, PART_COLUMNS, wasReopened, type ClientPartRow, type CycleMemberRow, type CycleRow } from "./access";
import { ownerActionsOn, type OwnerAction } from "./owner-rules";
import { averageOfRatings, isClientManagerLinkValid, isPartSubmitted, isSkipManagerLinkValid, memberStage, type ClientReviewStage } from "./rules";

// The cycle overview that replaces the owner's sheet (CR.2.3, story 10): the
// cycles, and for one cycle a row per member with their stage, their client
// manager, both averages once they exist, and the client manager's link to
// copy. It is read by review admins only (`org.reviews`), who see everything
// of a client review, so it shows each link in full: copying is how the owner
// sends one, because the app never sends a link to a client contact.
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
  /** The client manager's part, its full link, and when the owner last copied it. */
  clientManagerPartId: string | null;
  /** Null on the viewer's own row: nobody holds the link to the part that rates them. */
  link: string | null;
  /** Whether the link opens at all: not once the cycle is closed, the member withdrawn, or the link cancelled. */
  linkLive: boolean;
  linkCopiedAt: string | null;
  unlocked: boolean;
  /** The viewer is the member this row is about. */
  own: boolean;
  clientManagerPersonId: string | null;
  memberSent: boolean;
  clientManagerSent: boolean;
  /** A part the owner put back to open and that is not sent again yet. */
  memberReopened: boolean;
  clientManagerReopened: boolean;
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
  rows: ClientOverviewRow[];
};

type OverviewCycleRow = CycleRow & {
  company_id: string | null;
  opened_at: string;
  skip_manager_token: string | null;
  skip_manager_link_copied_at: string | null;
  companies: Embedded<{ name: string | null }>;
  review_frameworks: Embedded<{ name: string | null; rating_keys: string[] | null }>;
};

type OverviewMemberRow = CycleMemberRow & { team_member_id: string; client_manager_person_id: string | null };

type PersonRow = NamedPerson & { id: string };

/**
 * The overview of one cycle, or null when there is no such cycle. `origin`
 * makes each link whole, ready to paste. A review admin who is themselves in
 * the cycle gets no link on their own row: holding it would let them fill the
 * part that rates them (the boundary review on PR 2586).
 */
export async function clientCycleOverview(cycleId: string, origin: string, viewerTeamMemberIds: readonly string[]): Promise<ClientCycleOverview | null> {
  if (!isUuid(cycleId)) return null;
  const cycle = mustRows(
    await companyOs
      .from("review_cycles")
      .select(
        "id, name, company_id, opened_at, closed_at, framework_id, skip_manager_person_id, skip_manager_token, skip_manager_link_copied_at, skip_manager_link_cancelled_at, companies:companies!company_id(name), review_frameworks:review_frameworks!framework_id(name, rating_keys)",
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

  const rows = members
    .map((m): ClientOverviewRow => {
      const own = parts.filter((p) => p.team_member_id === m.team_member_id);
      const { facts, parts: byKind } = factsFrom(cycle, m, own);
      const cm = byKind.clientManager;
      const isViewer = viewerTeamMemberIds.includes(m.team_member_id);
      const actions = ownerActionsOn(facts);
      return {
        teamMemberId: m.team_member_id,
        name: memberNames.get(m.team_member_id) ?? "Team member",
        clientManagerName: m.client_manager_person_id ? (personNames.get(m.client_manager_person_id) ?? null) : null,
        stage: memberStage(facts),
        selfAverage: averageOf(byKind.member),
        // The viewer's own row shows nothing of the client manager's part: a
        // review admin in the cycle reads their own review as its member does
        // (the boundary review on PR 2612).
        clientManagerAverage: isViewer ? null : averageOf(cm),
        clientManagerPartId: cm?.id ?? null,
        link: cm?.access_token && !isViewer ? `${origin}${reviewLinkPath(cm)}` : null,
        linkLive: isClientManagerLinkValid(facts, { tokenMatches: true }).ok,
        linkCopiedAt: typeof cm?.metadata?.link_copied_at === "string" ? cm.metadata.link_copied_at : null,
        unlocked: m.rater_unlocked_at !== null,
        own: isViewer,
        clientManagerPersonId: m.client_manager_person_id,
        memberSent: isPartSubmitted(byKind.member),
        clientManagerSent: isPartSubmitted(cm),
        memberReopened: wasReopened(byKind.member) && !isPartSubmitted(byKind.member),
        clientManagerReopened: wasReopened(cm) && !isPartSubmitted(cm),
        released: m.released_at !== null,
        // Nobody is offered an action on their own review; the commands refuse it too.
        actions: isViewer ? (Object.fromEntries(Object.keys(actions).map((a) => [a, false])) as Record<OwnerAction, boolean>) : actions,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const stillIn = members.filter((m) => m.withdrawn_at === null);
  const skipReviewed = stillIn.filter((m) => isPartSubmitted(parts.find((p) => p.team_member_id === m.team_member_id && p.rater_kind === "skip_manager") ?? null)).length;
  // The skip-manager's link reaches every member, so a review admin who is in
  // the cycle gets none: it would open the client manager's part of their own
  // review before release.
  const viewerInCycle = stillIn.some((m) => viewerTeamMemberIds.includes(m.team_member_id));
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
    rows,
  };
}

/** The path of the skip-manager's link to a cycle: one page for every member, served by the portal (CR.3.2). */
export function skipManagerLinkPath(cycleId: string, token: string): string {
  return `/client-review/${cycleId}?t=${encodeURIComponent(token)}`;
}

/**
 * Records that the owner copied a client manager's link, so the overview can
 * say when (CR.2.3). The time is written beside the part's other metadata; it
 * says nothing about whether the link was sent, which only the owner knows.
 *
 * The metadata is read and written whole, and the client manager's answers
 * live in it too, so the write lands only if the part is as it was read: the
 * same status and the same link. A submission or a new link in between makes
 * it miss, and the owner is asked to reload rather than having the time
 * written over answers it never saw.
 */
export type LinkCopiedResult = { ok: true; copiedAt: string } | { ok: false; error: string };

export async function markClientManagerLinkCopied(reviewId: string): Promise<LinkCopiedResult> {
  if (!isUuid(reviewId)) return { ok: false, error: "That link was not found." };
  const row = mustRows(
    await companyOs
      .from("performance_reviews")
      .select("id, status, access_token, metadata")
      .eq("id", reviewId)
      .eq("review_type", "client")
      .eq("rater_kind", "client_manager")
      .limit(1),
    "[org/client-reviews] performance_reviews",
  )[0] as { id: string; status: string; access_token: string | null; metadata: Record<string, unknown> | null } | undefined;
  if (!row || !row.access_token) return { ok: false, error: "That link was not found." };
  const copiedAt = new Date().toISOString();
  const { data, error } = await companyOs
    .from("performance_reviews")
    .update({ metadata: { ...(row.metadata ?? {}), link_copied_at: copiedAt } as Json })
    .eq("id", reviewId)
    .eq("status", row.status)
    .eq("access_token", row.access_token)
    .select("id");
  if (error) return { ok: false, error: "The link was copied, but the time could not be saved." };
  if (!data?.length) return { ok: false, error: "The link was copied, but the review changed just now. Reload to see it." };
  return { ok: true, copiedAt };
}

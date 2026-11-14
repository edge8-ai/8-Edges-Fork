import { timingSafeEqual } from "crypto";
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { isUuid } from "@/kernel/config/slug";
import {
  canClientManagerFillPart,
  canStillEditPart,
  isPartSubmitted,
  type ClientReviewFacts,
  type LinkRefusal,
  type ReviewPartStatus,
} from "./rules";

// Who may fill one part of a client review, asked of the rules module from the
// rows (CR.2.2). The survey runner's page, the submit endpoint and the client
// manager's link page all come through here, so none of them decides a rule of
// its own: they load nothing about the cycle themselves and only say who is
// asking (a token from a link, or the signed-in team member).
//
// Every read is a must-read. A failed read here would otherwise look like a
// missing cycle or member, and the answer to that is "no access"; but it is
// still a failure, and the person deserves an error, not a page saying their
// link has stopped working when it has not.

/** The start of every client part's cycle label; the rest is the cycle's id (open-cycle.ts, clientCycleLabel). */
const CYCLE_LABEL_PREFIX = "client:";

/** The cycle a client part's label names, or null for a label that names none. */
export function clientCycleIdOf(label: string | null): string | null {
  const id = label?.startsWith(CYCLE_LABEL_PREFIX) ? label.slice(CYCLE_LABEL_PREFIX.length) : null;
  return id && isUuid(id) ? id : null;
}

/**
 * Every team-member row of one person: a person can hold more than one
 * engagement, and each row is them. The owner's screens and commands refuse
 * someone their own review by this list (the boundary review on PR 2608). The
 * read is a must-read, so a failed read throws rather than answering "not
 * you", which is the permissive answer here; a session's team identity is not
 * used for this, because it reads as "no team member" when its own read fails.
 */
export async function teamMemberIdsOf(personId: string | null): Promise<string[]> {
  if (!personId) return [];
  const rows = mustRows(await companyOs.from("team_members").select("id").eq("person_id", personId), "[org/client-reviews] team_members") as { id: string }[];
  return rows.map((r) => r.id);
}

/** The columns of a review part this module and its callers read. */
export const PART_COLUMNS = "id, team_member_id, rater_kind, review_type, status, submitted_at, ratings, achievements, improvements, comments, metadata, access_token";

export type ClientPartRow = {
  id: string;
  team_member_id: string;
  rater_kind: string;
  review_type: string;
  status: ReviewPartStatus;
  submitted_at: string | null;
  ratings: Record<string, number> | null;
  achievements: string | null;
  improvements: string | null;
  comments: string | null;
  metadata: Record<string, unknown> | null;
  access_token: string | null;
};

/** One member's review in one cycle, with the facts the rules read. */
export type ClientReviewSetting = {
  facts: ClientReviewFacts;
  cycle: { id: string; name: string; closedAt: string | null; frameworkId: string; companyId: string | null };
  /** The person the cycle names as this member's client manager; signing in as them is a way in (CR.3.6). */
  clientManagerPersonId: string | null;
  parts: { member: ClientPartRow | null; clientManager: ClientPartRow | null; skipManager: ClientPartRow | null };
};

/** The columns of a cycle the rules' facts are read from. */
export type CycleRow = {
  id: string;
  name: string;
  closed_at: string | null;
  framework_id: string;
  skip_manager_person_id: string | null;
  skip_manager_link_cancelled_at: string | null;
};

/** The columns of a member's place in a cycle the rules' facts are read from. */
export type CycleMemberRow = {
  withdrawn_at: string | null;
  rater_unlocked_at: string | null;
  skip_waived_at: string | null;
  released_at: string | null;
};

/** Whether a client manager's part carries a cancellation of its link. Reissuing a link replaces the token instead, so the old one simply stops matching. */
function linkCancelled(part: ClientPartRow): boolean {
  return typeof part.metadata?.link_cancelled_at === "string";
}

/**
 * Whether the owner put a sent part back to open (CR.2.4). The reopening is
 * written on the part, so this stays true once it is sent again; the rules
 * read it beside the status.
 */
export function wasReopened(part: Pick<ClientPartRow, "metadata"> | null): boolean {
  return typeof part?.metadata?.reopened_at === "string";
}

/**
 * The rules' facts for one member, from their rows, and their parts by kind.
 * The one place rows become facts: the link page, the runner and the cycle
 * overview all read them through here, so none can disagree about a stage.
 */
export function factsFrom(
  cycle: CycleRow,
  member: CycleMemberRow,
  parts: readonly ClientPartRow[],
): { facts: ClientReviewFacts; parts: ClientReviewSetting["parts"] } {
  const byKind = (kind: string) => parts.find((p) => p.rater_kind === kind) ?? null;
  const memberPart = byKind("self");
  const clientManagerPart = byKind("client_manager");
  const skipManagerPart = byKind("skip_manager");
  return {
    facts: {
      cycle: {
        closedAt: cycle.closed_at,
        hasSkipManager: cycle.skip_manager_person_id !== null,
        skipManagerLinkCancelled: cycle.skip_manager_link_cancelled_at !== null,
      },
      member: {
        withdrawnAt: member.withdrawn_at,
        raterUnlockedAt: member.rater_unlocked_at,
        skipWaivedAt: member.skip_waived_at,
        releasedAt: member.released_at,
      },
      parts: {
        member: memberPart ? { status: memberPart.status, reopened: wasReopened(memberPart) } : null,
        clientManager: clientManagerPart
          ? { status: clientManagerPart.status, reopened: wasReopened(clientManagerPart), linkCancelled: linkCancelled(clientManagerPart) }
          : null,
        skipManager: skipManagerPart ? { status: skipManagerPart.status } : null,
      },
    },
    parts: { member: memberPart, clientManager: clientManagerPart, skipManager: skipManagerPart },
  };
}

/**
 * The cycle, the member's place in it and their three parts, read for the part
 * with this id. Null when the id is not a client review part, or when its
 * cycle or the member's place in it is missing, which no write path leaves
 * behind and which grants nothing.
 */
export async function clientReviewSetting(partId: string): Promise<ClientReviewSetting | null> {
  // The cycle is read off the part's label, `client:<cycle id>`, which opening
  // writes on every part (clientCycleLabel), not off review_cycle_id. The two
  // name the same cycle; the label is the one the public fork's schema dump
  // already has, and the dump is the fork's only database source until it is
  // regenerated from production with its upgrade delta (CR.1, still to do).
  const anchor = mustRows(
    await companyOs.from("performance_reviews").select("cycle_label, team_member_id").eq("id", partId).eq("review_type", "client").limit(1),
    "[org/client-reviews] performance_reviews",
  )[0] as { cycle_label: string | null; team_member_id: string } | undefined;
  const cycleId = clientCycleIdOf(anchor?.cycle_label ?? null);
  if (!anchor || !cycleId) return null;

  const [cycleRes, memberRes, partsRes] = await Promise.all([
    companyOs
      .from("review_cycles")
      .select("id, name, closed_at, framework_id, skip_manager_person_id, skip_manager_link_cancelled_at, company_id")
      .eq("id", cycleId)
      .limit(1),
    companyOs
      .from("review_cycle_members")
      .select("withdrawn_at, rater_unlocked_at, skip_waived_at, released_at, client_manager_person_id")
      .eq("cycle_id", cycleId)
      .eq("team_member_id", anchor.team_member_id)
      .limit(1),
    companyOs
      .from("performance_reviews")
      .select(PART_COLUMNS)
      .eq("review_cycle_id", cycleId)
      .eq("team_member_id", anchor.team_member_id)
      .eq("review_type", "client"),
  ]);
  const cycle = mustRows(cycleRes, "[org/client-reviews] review_cycles")[0] as (CycleRow & { company_id: string | null }) | undefined;
  const member = mustRows(memberRes, "[org/client-reviews] review_cycle_members")[0] as (CycleMemberRow & { client_manager_person_id: string | null }) | undefined;
  const parts = mustRows(partsRes, "[org/client-reviews] performance_reviews") as ClientPartRow[];
  if (!cycle || !member) return null;
  // The cycle came from the part's label and its parts from the cycle column.
  // A part that is not among the parts read has a label and a column naming
  // different cycles, which no writer produces; it is judged on nothing
  // rather than on another cycle's facts.
  if (!parts.some((p) => p.id === partId)) return null;

  const { facts, parts: byKind } = factsFrom(cycle, member, parts);
  return {
    facts,
    cycle: { id: cycle.id, name: cycle.name, closedAt: cycle.closed_at, frameworkId: cycle.framework_id, companyId: cycle.company_id },
    clientManagerPersonId: member.client_manager_person_id,
    parts: byKind,
  };
}

/**
 * Whether a token someone presented is the stored one. A missing or empty
 * token on either side matches nothing, so null never matches null (the rules
 * module's warning), and the comparison takes the same time however much of a
 * guess is right.
 */
export function tokenMatches(presented: string | null, stored: string | null): boolean {
  if (!presented || !stored) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(stored);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Why a part cannot be filled by the person asking. */
export type ClientPartRefusal = LinkRefusal | "already_submitted" | "not_yet" | "locked" | "not_rater";

export type ClientPartAccess =
  | { ok: true; setting: ClientReviewSetting }
  | { ok: false; reason: ClientPartRefusal; setting: ClientReviewSetting | null };

/**
 * Whether this person may fill this part now. The client manager is known by
 * the token on their link, or by signing in with portal access at the cycle's
 * client (signedInAt, CR.3.6); the member by their signed-in team member id. The skip-manager does not fill a form here: their comments
 * and Reviewed mark go through their own page.
 */
export async function clientPartAccess(
  part: { id: string; rater_kind: string; team_member_id: string; access_token: string | null },
  who: { token: string | null; teamMemberId: string | null; personIds?: readonly string[] },
): Promise<ClientPartAccess> {
  const setting = await clientReviewSetting(part.id);
  if (!setting) return { ok: false, reason: "not_rater", setting: null };

  if (part.rater_kind === "client_manager") {
    // Signing in as the person the cycle names as this member's client
    // manager is a second way in (CR.3.6). It is judged by the same rules as
    // the link, except that a cancelled link does not stop it: cancelling a
    // link stops a leaked link, and changing the client manager is what takes
    // the part away from someone (approved on the CR.3.6 prototype).
    const signedIn = await signedInAt(who.personIds, setting.clientManagerPersonId, setting.cycle.companyId);
    // The setting handed back carries the facts this was judged on, so what
    // the caller shows (the member's answers beside the form) is decided on
    // the same facts as the access, not on the link's cancellation.
    const judged = signedIn ? { ...setting, facts: asSignedIn(setting.facts) } : setting;
    const answer = canClientManagerFillPart(judged.facts, { tokenMatches: signedIn || tokenMatches(who.token, part.access_token) });
    return answer.ok ? { ok: true, setting: judged } : { ok: false, reason: answer.reason, setting: judged };
  }

  if (part.rater_kind === "self") {
    if (!who.teamMemberId || who.teamMemberId !== part.team_member_id) return { ok: false, reason: "not_rater", setting };
    if (canStillEditPart(setting.facts, "member")) return { ok: true, setting };
    // Submitted reads as submitted; a closed cycle or a withdrawn member as locked.
    return { ok: false, reason: isPartSubmitted(setting.facts.parts.member) ? "already_submitted" : "locked", setting };
  }

  return { ok: false, reason: "not_rater", setting };
}

/**
 * The facts as the client manager signed in to the portal meets them: a
 * cancelled link is about the link, so it is set aside, and every other rule
 * stands (CR.3.6). The form and the portal home's card both judge through
 * this, so they cannot disagree about whether a part is open to them.
 */
export function asSignedIn(facts: ClientReviewFacts): ClientReviewFacts {
  const part = facts.parts.clientManager;
  return part ? { ...facts, parts: { ...facts.parts, clientManager: { ...part, linkCancelled: false } } } : facts;
}

/**
 * Whether a signed-in contact is the person a cycle names (CR.3.6).
 * `personIds` is every people row linked to the sign-in, since one sign-in can
 * hold more than one row; a person the cycle does not name matches nothing.
 */
function signedInAs(personIds: readonly string[] | undefined, named: string | null): boolean {
  return named !== null && (personIds ?? []).includes(named);
}

/**
 * Whether a sign-in is a way in to one cycle (CR.3.6): the sign-in is the
 * person the cycle names, and that person holds an active portal membership
 * at the cycle's own client. Revoking someone's portal access at that client
 * stops this way in, even while they can still sign in through another client
 * (the owner's call on the boundary review of PR 2622). The read is a must-read, so
 * a failed read throws rather than answering either way.
 */
export async function signedInAt(personIds: readonly string[] | undefined, named: string | null, companyId: string | null): Promise<boolean> {
  if (!named || !companyId || !signedInAs(personIds, named)) return false;
  return (await activePortalMemberships([named])).has(membershipKey(named, companyId));
}

/** `person:company` for each active portal membership of these people. */
export async function activePortalMemberships(personIds: readonly string[]): Promise<Set<string>> {
  if (personIds.length === 0) return new Set();
  const rows = mustRows(
    await companyOs.from("portal_members").select("person_id, company_id").in("person_id", [...personIds]).eq("status", "active"),
    "[org/client-reviews] portal_members",
  ) as { person_id: string; company_id: string }[];
  return new Set(rows.map((r) => membershipKey(r.person_id, r.company_id)));
}

export function membershipKey(personId: string, companyId: string): string {
  return `${personId}:${companyId}`;
}


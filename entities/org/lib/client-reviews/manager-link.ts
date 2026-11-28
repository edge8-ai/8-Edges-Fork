import { companyOs, type Json } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import type { Result } from "@/kernel/data/result";
import { isUuid } from "@/kernel/config/slug";
import { recordAudit } from "@/kernel/audit/audit";
import { newLinkToken } from "./link-token";
import { isReviewedInCycle } from "./owner-rules";

// A client manager's one link to a cycle (CR.5.6): a page listing every
// member they review in it, each opening that member's form. The owner copies
// it to send by hand, cancels it, or replaces it, as with the skip-manager's
// link (./skip-link). Nothing here contacts anyone: the owner sends the link
// themselves, from their own email.
//
// The page opens each member's form with the form's own token. Cancelling or
// replacing the link therefore also gives every one of the manager's forms in
// the cycle a new token, in the same command, so cancel really ends access
// (spec, "Schema and link decisions").
//
// The database client cannot hold a transaction across the two tables, and
// each form's token is its own write, so the commands fail closed instead.
// While a manager's link is cancelled, none of their form links opens either
// (clientPartAccess in ./access reads the link beside the form). Stopping the
// link is therefore one write that ends every way in by token at once, and
// every command here makes it first: a write that fails after it leaves
// nothing from before working, old link and old form links alike, and running
// the command again finishes it (the code review of CR.5, P3). A row on its
// own is not "sent": only copied_at says the owner copied it (the db-review
// of the phase A migrations).

export type ManagerLinkResult = { ok: true; at: string } | { ok: false; error: string };

type Actor = { personId: string; email: string; ownTeamMemberIds: readonly string[] };

type LinkRow = { id: string; access_token: string; copied_at: string | null; cancelled_at: string | null };

type ManagedMember = { team_member_id: string; withdrawn_at: string | null };

const LINKS = "[org/client-reviews] review_cycle_manager_links";
const MEMBERS = "[org/client-reviews] review_cycle_members";

async function linkOf(cycleId: string, personId: string): Promise<LinkRow | null> {
  return (
    (mustRows(
      await companyOs
        .from("review_cycle_manager_links")
        .select("id, access_token, copied_at, cancelled_at")
        .eq("cycle_id", cycleId)
        .eq("client_manager_person_id", personId)
        .limit(1),
      LINKS,
    )[0] as LinkRow | undefined) ?? null
  );
}

/** Every member row of the cycle that names this person as client manager, withdrawn ones included. */
async function membersOf(cycleId: string, personId: string): Promise<ManagedMember[]> {
  return mustRows(
    await companyOs.from("review_cycle_members").select("team_member_id, withdrawn_at").eq("cycle_id", cycleId).eq("client_manager_person_id", personId),
    MEMBERS,
  ) as ManagedMember[];
}

/**
 * Gives every client manager's part of these members in the cycle a new
 * token, so no form link copied before still opens. Only the token changes:
 * the part's answers and status are not touched, so a submission landing in
 * between is not written over. False when a write failed.
 */
async function rotatePartTokens(cycleId: string, teamMemberIds: readonly string[]): Promise<boolean> {
  if (teamMemberIds.length === 0) return true;
  const parts = mustRows(
    await companyOs
      .from("performance_reviews")
      .select("id")
      .eq("review_cycle_id", cycleId)
      .eq("review_type", "client")
      .eq("rater_kind", "client_manager")
      .in("team_member_id", [...teamMemberIds]),
    "[org/client-reviews] performance_reviews",
  ) as { id: string }[];
  // One token per part: each is its own credential, and the column is unique.
  const written = await Promise.all(parts.map((p) => companyOs.from("performance_reviews").update({ access_token: newLinkToken() }).eq("id", p.id)));
  return written.every((w) => !w.error);
}

type Stopped = { ok: true; now: boolean } | { ok: false };

/**
 * Cancels a link, in the one write after which neither it nor any of the
 * manager's form links opens (./access). `now` says whether this run
 * cancelled it, so a run finishing an earlier one is not recorded twice.
 */
async function stopLink(linkId: string, at: string): Promise<Stopped> {
  const { data, error } = await companyOs.from("review_cycle_manager_links").update({ cancelled_at: at }).eq("id", linkId).is("cancelled_at", null).select("id");
  if (error) return { ok: false };
  return { ok: true, now: (data?.length ?? 0) > 0 };
}

/**
 * Makes sure every client manager of a member still in the cycle has a link
 * row. Safe to run any number of times: a row already there keeps its token,
 * its copied time and its cancellation, so ensuring never revives a cancelled
 * link or replaces one the owner has sent. Opening, adding a member and
 * changing a client manager all call this.
 */
export async function ensureManagerLinks(cycleId: string): Promise<Result> {
  const named = mustRows(
    await companyOs.from("review_cycle_members").select("client_manager_person_id").eq("cycle_id", cycleId).is("withdrawn_at", null).not("client_manager_person_id", "is", null),
    MEMBERS,
  ) as { client_manager_person_id: string | null }[];
  const people = [...new Set(named.map((m) => m.client_manager_person_id).filter((id): id is string => id !== null))];
  if (people.length === 0) return { ok: true };
  const { error } = await companyOs
    .from("review_cycle_manager_links")
    .upsert(
      people.map((personId) => ({ cycle_id: cycleId, client_manager_person_id: personId, access_token: newLinkToken() })),
      { onConflict: "cycle_id,client_manager_person_id", ignoreDuplicates: true },
    );
  if (error) return { ok: false, error: "Could not write the client managers' links. Try again to finish." };
  return { ok: true };
}

/**
 * What happens to a client manager's link once a member is handed to someone
 * else (changeClientManager). The new manager gets a link if they had none.
 * The previous one keeps theirs while they still review anyone in the cycle;
 * once they review nobody still in it, their link is cancelled and their
 * remaining forms get new tokens, so nothing they hold opens anything. When
 * no member row of the cycle names them at all any more, the link row is
 * deleted: it is a credential, not a record of anyone's work, and its key to
 * the person has no ON DELETE, so a row left behind would stop the person ever
 * being deleted from the CRM (the db-review of the phase A migrations). The
 * audit record keeps that it happened.
 */
export async function managerReplaced(cycleId: string, previousPersonId: string | null, by: Actor): Promise<Result> {
  const ensured = await ensureManagerLinks(cycleId);
  if (!ensured.ok) return ensured;
  if (!previousPersonId) return { ok: true };
  return retireIfReviewingNobody(cycleId, previousPersonId, by, { whose: "The previous client manager's", reason: "client_manager_changed" });
}

/**
 * What happens to a client manager's link once a member they review is
 * withdrawn (withdrawCycleMember). While they still review someone in the
 * cycle, their link stays live. Once they review nobody still in it, the link
 * is cancelled outright and their forms get new tokens, the same writes as
 * cancelManagerLink (Khoa's ruling 4, 2026-11-17), so a link left with nobody
 * on it opens nothing. The row stays, since the withdrawn member's row still
 * names them.
 */
export async function memberWithdrawn(cycleId: string, clientManagerPersonId: string | null, by: Actor): Promise<Result> {
  if (!clientManagerPersonId) return { ok: true };
  return retireIfReviewingNobody(cycleId, clientManagerPersonId, by, { whose: "Their client manager's", reason: "member_withdrawn" });
}

/**
 * Cancels the link of a manager who reviews nobody still in the cycle, and
 * gives their forms new tokens; deletes the row when no member row names them
 * at all (managerReplaced says why). A manager who still reviews someone
 * keeps a live link.
 */
async function retireIfReviewingNobody(
  cycleId: string,
  personId: string,
  by: Actor,
  why: { whose: string; reason: "client_manager_changed" | "member_withdrawn" },
): Promise<Result> {
  const rows = await membersOf(cycleId, personId);
  if (rows.some((m) => m.withdrawn_at === null)) return { ok: true };
  const link = await linkOf(cycleId, personId);
  if (link && !link.cancelled_at && !(await stopLink(link.id, new Date().toISOString())).ok) {
    return { ok: false, error: `${why.whose} link could not be stopped. Try again.` };
  }
  if (!(await rotatePartTokens(cycleId, rows.map((m) => m.team_member_id)))) return { ok: false, error: `${why.whose} forms could not all be closed. Try again.` };
  if (!link) return { ok: true };
  if (rows.length === 0) {
    const { error } = await companyOs.from("review_cycle_manager_links").delete().eq("id", link.id);
    if (error) return { ok: false, error: `${why.whose} link was stopped, but could not be removed. Try again.` };
  }
  await audit(link.id, by, { action: "client_review.manager_link_retired", cycleId, reason: why.reason, deleted: rows.length === 0 });
  return { ok: true };
}

type Checked = { ok: true; link: LinkRow | null; members: ManagedMember[] } | { ok: false; error: string };

/**
 * Whether the owner may act on this manager's link now. Someone among the
 * manager's own members may not: the link opens the part that rates them, so
 * a colleague looks after it, as with every action on one's own review (the
 * boundary review on PR 2606). A cycle that is closed has no link to act on.
 */
async function checked(cycleId: string, personId: string, by: Actor): Promise<Checked> {
  if (!isUuid(cycleId) || !isUuid(personId)) return { ok: false, error: "That link was not found." };
  const cycle = mustRows(await companyOs.from("review_cycles").select("id, closed_at").eq("id", cycleId).limit(1), "[org/client-reviews] review_cycles")[0] as
    | { id: string; closed_at: string | null }
    | undefined;
  if (!cycle) return { ok: false, error: "That cycle was not found." };
  if (cycle.closed_at) return { ok: false, error: "This cycle is closed, so its links no longer open." };
  const members = await membersOf(cycleId, personId);
  const stillIn = members.filter((m) => m.withdrawn_at === null).map((m) => m.team_member_id);
  if (stillIn.length === 0) return { ok: false, error: "They are not a client manager of anyone in this cycle." };
  if (isReviewedInCycle(stillIn, by)) return { ok: false, error: "They are your client manager in this cycle, so a colleague looks after their link." };
  return { ok: true, link: await linkOf(cycleId, personId), members };
}

/**
 * Records that the owner copied a manager's link. The write lands only while
 * the link is the one the page showed and still live, so a copy of a link
 * replaced in another tab is not recorded against the new one.
 */
export async function markManagerLinkCopied(cycleId: string, personId: string, by: Actor): Promise<ManagerLinkResult> {
  const found = await checked(cycleId, personId, by);
  if (!found.ok) return found;
  if (!found.link || found.link.cancelled_at) return { ok: false, error: "This link is cancelled. Issue a new one first." };
  const at = new Date().toISOString();
  const { data, error } = await companyOs
    .from("review_cycle_manager_links")
    .update({ copied_at: at })
    .eq("id", found.link.id)
    .eq("access_token", found.link.access_token)
    .is("cancelled_at", null)
    .select("id");
  if (error) return { ok: false, error: "The link was copied, but the time could not be saved." };
  if (!data?.length) return { ok: false, error: "The link was copied, but it changed just now. Reload to see it." };
  return { ok: true, at };
}

/**
 * Stops a manager's link working, and gives each of their forms in the cycle
 * a new token so no form link copied before still opens. The answers they
 * have given so far stay. Running it on a link already cancelled gives the
 * forms new tokens again, which finishes a run that stopped halfway.
 */
export async function cancelManagerLink(cycleId: string, personId: string, by: Actor): Promise<ManagerLinkResult> {
  const found = await checked(cycleId, personId, by);
  if (!found.ok) return found;
  if (!found.link) return { ok: false, error: "They have no link in this cycle yet. Issue one first." };
  const at = new Date().toISOString();
  const stopped = await stopLink(found.link.id, at);
  if (!stopped.ok) return { ok: false, error: "The link could not be cancelled." };
  if (!(await rotatePartTokens(cycleId, found.members.map((m) => m.team_member_id)))) {
    return { ok: false, error: "The link is cancelled and none of its forms opens, but they could not all be given new links. Cancel again to finish." };
  }
  if (stopped.now) await audit(found.link.id, by, { action: "client_review.manager_link_cancelled", cycleId });
  return { ok: true, at: found.link.cancelled_at ?? at };
}

const REISSUE_UNFINISHED = "The old link and its forms are stopped, but the new link is not ready yet. Issue a new link again to finish.";

/**
 * Replaces a manager's link with a new one: the old link and every form link
 * copied before stop at once, a cancelled link works again under the new
 * token, and the new link is marked not yet copied. Their answers so far stay.
 * A manager with no row yet (a cycle opened before links existed) gets one.
 *
 * Three writes, in the order that fails closed. The old link is stopped
 * first, which also closes every form link copied before (./access). The
 * forms get new tokens second. Only then does the link take its new token and
 * open again. A run that fails after the first write leaves the manager with
 * nothing that opens, old or new, until the command is run again.
 */
export async function reissueManagerLink(cycleId: string, personId: string, by: Actor): Promise<ManagerLinkResult> {
  const found = await checked(cycleId, personId, by);
  if (!found.ok) return found;
  const at = new Date().toISOString();
  let linkId: string;
  if (found.link) {
    if (!found.link.cancelled_at && !(await stopLink(found.link.id, at)).ok) return { ok: false, error: "A new link could not be issued." };
    linkId = found.link.id;
  } else {
    // A first link is written cancelled, so it closes the forms' old links
    // before their tokens change, as stopping an existing one does.
    const { data, error } = await companyOs
      .from("review_cycle_manager_links")
      .insert({ cycle_id: cycleId, client_manager_person_id: personId, access_token: newLinkToken(), cancelled_at: at })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: "A new link could not be issued." };
    linkId = data.id;
  }
  if (!(await rotatePartTokens(cycleId, found.members.map((m) => m.team_member_id)))) return { ok: false, error: REISSUE_UNFINISHED };
  const { error } = await companyOs
    .from("review_cycle_manager_links")
    .update({ access_token: newLinkToken(), cancelled_at: null, copied_at: null })
    .eq("id", linkId);
  if (error) return { ok: false, error: REISSUE_UNFINISHED };
  await audit(linkId, by, { action: "client_review.manager_link_reissued", cycleId, wasCancelled: found.link?.cancelled_at != null });
  return { ok: true, at };
}

/** The record never carries a token: audit_log is readable by the assistants. */
async function audit(linkId: string, by: Actor, context: Record<string, Json>) {
  await recordAudit({ table: "review_cycle_manager_links", recordId: linkId, operation: "update", actor: by.email, context: { ...context, byPersonId: by.personId } });
}

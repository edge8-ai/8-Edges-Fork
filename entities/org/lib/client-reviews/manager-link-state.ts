import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { isUuid } from "@/kernel/config/slug";
import { isReviewedInCycle } from "./owner-rules";

// Where each client manager's one link to a cycle stands, for the owner's
// screens (CR.5.6): the overview's links card (CR.5.7) and the member page's
// link row (CR.5.8) both read it here, so they cannot disagree. Only a holder
// of the reviews permission reaches those screens; this is the one place
// outside the link check that reads a manager link's token, and it hands it
// back only inside the link to copy.

export type ManagerLinkState = {
  clientManagerPersonId: string;
  /** The members still in the cycle this manager reviews. */
  members: number;
  /**
   * The link, whole, while it works and the viewer may copy it; null when it
   * is cancelled, when the cycle is closed, when the manager has no row yet,
   * and for a viewer who is one of the manager's members (the link opens the
   * part that rates them).
   */
  url: string | null;
  /** When the owner last copied it: the only sign it went out. A row alone is not "sent". */
  copiedAt: string | null;
  cancelledAt: string | null;
  /** The viewer is one of this manager's members, so a colleague looks after the link. */
  viewerReviewed: boolean;
};

/** The path of a client manager's link: one page for every member they review, served by the portal. */
export function managerLinkPath(cycleId: string, token: string): string {
  return `/client-review/${cycleId}/manager/?t=${encodeURIComponent(token)}`;
}

/**
 * Every client manager of a member still in the cycle, with their link's
 * state, in no particular order: the caller names and orders them.
 * Empty for an unknown cycle.
 */
export async function managerLinksOf(cycleId: string, origin: string, viewerTeamMemberIds: readonly string[]): Promise<ManagerLinkState[]> {
  if (!isUuid(cycleId)) return [];
  const [cycleRes, membersRes, linksRes] = await Promise.all([
    companyOs.from("review_cycles").select("id, closed_at").eq("id", cycleId).limit(1),
    companyOs.from("review_cycle_members").select("team_member_id, client_manager_person_id").eq("cycle_id", cycleId).is("withdrawn_at", null),
    companyOs.from("review_cycle_manager_links").select("client_manager_person_id, access_token, copied_at, cancelled_at").eq("cycle_id", cycleId),
  ]);
  const cycle = mustRows(cycleRes, "[org/client-reviews] review_cycles")[0] as { id: string; closed_at: string | null } | undefined;
  if (!cycle) return [];
  const members = mustRows(membersRes, "[org/client-reviews] review_cycle_members") as { team_member_id: string; client_manager_person_id: string | null }[];
  const links = mustRows(linksRes, "[org/client-reviews] review_cycle_manager_links") as {
    client_manager_person_id: string;
    access_token: string;
    copied_at: string | null;
    cancelled_at: string | null;
  }[];

  const byManager = new Map<string, string[]>();
  for (const m of members) {
    if (!m.client_manager_person_id) continue;
    byManager.set(m.client_manager_person_id, [...(byManager.get(m.client_manager_person_id) ?? []), m.team_member_id]);
  }
  const viewer = { ownTeamMemberIds: viewerTeamMemberIds };
  return [...byManager].map(([personId, memberIds]): ManagerLinkState => {
    const link = links.find((l) => l.client_manager_person_id === personId) ?? null;
    const viewerReviewed = isReviewedInCycle(memberIds, viewer);
    const live = link !== null && link.cancelled_at === null && cycle.closed_at === null;
    return {
      clientManagerPersonId: personId,
      members: memberIds.length,
      url: link && live && !viewerReviewed ? `${origin}${managerLinkPath(cycleId, link.access_token)}` : null,
      copiedAt: link?.copied_at ?? null,
      cancelledAt: link?.cancelled_at ?? null,
      viewerReviewed,
    };
  });
}

/** One manager's link state in a cycle, for the member page (CR.5.8); null when they review nobody still in it. */
export async function managerLinkOf(cycleId: string, clientManagerPersonId: string, origin: string, viewerTeamMemberIds: readonly string[]): Promise<ManagerLinkState | null> {
  return (await managerLinksOf(cycleId, origin, viewerTeamMemberIds)).find((s) => s.clientManagerPersonId === clientManagerPersonId) ?? null;
}

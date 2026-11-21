import { managerLinksOf, type ManagerLinkState } from "./manager-link-state";
import { managerLinkRow, type ManagerLinkRow } from "./member-page";
import type { ClientCycleOverview, ClientOverviewRow } from "./overview";

// The overview's "Send the client their links" card (CR.5.7): one line per
// client manager, each with their one link to the cycle (CR.5.6), and the
// skip-manager's line after them. The link states come from
// ./manager-link-state, which the member page's link row reads too, and the
// words for a link the viewer cannot copy come from that row's own function,
// so the two screens cannot say it differently. Copying sends nothing: the
// owner sends each link herself, because the app never contacts the client.

/** One client manager's line on the card. */
export type ClientManagerLine = {
  clientManagerPersonId: string;
  name: string;
  /** "Client manager · 5 members · 0 of 5 sent". */
  detail: string;
  /** The link to copy, or why there is none, in the member page's words. */
  link: ManagerLinkRow;
  /** Whether the owner may cancel the link: it works, and the viewer is not one of the manager's members. */
  canCancel: boolean;
  /** Whether the owner may issue a link: an open cycle, and the viewer is not one of the manager's members. */
  canIssue: boolean;
  /** The manager has a link already, so issuing one replaces it. */
  hasLink: boolean;
};

/** The skip-manager's line: their link is the cycle's, read with the overview. */
type SkipManagerLine = { name: string; detail: string };

export type ClientLinks = { managers: ClientManagerLine[]; skip: SkipManagerLine | null };

const membersWord = (n: number) => `${n} ${n === 1 ? "member" : "members"}`;

/**
 * The managers' lines, from their link states and the overview's rows, in
 * name order. A manager's progress counts only members still in the cycle,
 * as their link state does.
 */
export function clientManagerLines(
  states: readonly ManagerLinkState[],
  rows: readonly Pick<ClientOverviewRow, "clientManagerPersonId" | "clientManagerName" | "clientManagerSent" | "stage">[],
  closed: boolean,
): ClientManagerLine[] {
  return states
    .map((state): ClientManagerLine => {
      const theirs = rows.filter((r) => r.clientManagerPersonId === state.clientManagerPersonId && r.stage !== "withdrawn");
      const name = theirs.find((r) => r.clientManagerName)?.clientManagerName ?? "The client manager";
      const sent = theirs.filter((r) => r.clientManagerSent).length;
      const mayAct = !closed && !state.viewerReviewed;
      return {
        clientManagerPersonId: state.clientManagerPersonId,
        name,
        detail: `Client manager · ${membersWord(state.members)} · ${sent} of ${state.members} sent`,
        // Never null: a state exists for this manager.
        link: managerLinkRow(state, name, closed, "issue one below")!,
        canCancel: mayAct && state.url !== null,
        canIssue: mayAct,
        hasLink: state.url !== null || state.cancelledAt !== null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The skip-manager's line, or null for a cycle with none. */
export function skipManagerLine(overview: Pick<ClientCycleOverview, "skipManagerName" | "skipReviewed" | "cycle">): SkipManagerLine | null {
  if (!overview.skipManagerName) return null;
  const n = overview.cycle.members;
  return { name: overview.skipManagerName, detail: `Skip-manager · ${membersWord(n)} · ${overview.skipReviewed} of ${n} marked reviewed` };
}

/** The card for one cycle's overview. `viewerTeamMemberIds` keeps a manager's link from a viewer they review. */
export async function clientLinksOf(overview: ClientCycleOverview, origin: string, viewerTeamMemberIds: readonly string[]): Promise<ClientLinks> {
  const states = await managerLinksOf(overview.cycle.id, origin, viewerTeamMemberIds);
  return { managers: clientManagerLines(states, overview.rows, overview.cycle.closedAt !== null), skip: skipManagerLine(overview) };
}

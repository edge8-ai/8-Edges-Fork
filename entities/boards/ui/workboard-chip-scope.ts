import type { WorkboardData } from "@/entities/boards/lib/workboard";

/**
 * Which card chips say nothing in THIS scope, and should therefore not be
 * drawn (the playbook's colour hierarchy, last consequence).
 *
 * A chip that is true of every card on screen is decoration: "Internal" on
 * an all-internal board distinguishes no card from any other, and twelve
 * copies of the same client name is a column of noise where a categorical
 * signal should be. The board works it out once and every card obeys.
 */
export type ChipScope = { hideInternal: boolean; hideClient: boolean };

export function chipScope(data: WorkboardData, clientFilter: string[]): ChipScope {
  return {
    hideInternal: data.cards.length > 0 && data.cards.every((c) => c.internal),
    // Read off the FILTER, not off the cards on screen. A search that happens
    // to match one client's cards has not told you whose they are; choosing
    // that client has.
    hideClient: clientFilter.length === 1,
  };
}

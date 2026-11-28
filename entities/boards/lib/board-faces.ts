import type { WorkboardData } from "./workboard";

/**
 * Everyone a board draws a face for (LD.8): the assignee of each card, which
 * the card face draws as FaceAvatar. A team page asks the kernel's faces seam
 * (kernel/shell/faces.ts) once with this list, so a border costs one read
 * however many cards the board holds. It names nobody the page was not already
 * handed: every id is a card's assignee on the data the page already read.
 */
export function boardFacesDrawn(data: Pick<WorkboardData, "cards">): string[] {
  const ids = new Set<string>();
  for (const c of data.cards) if (c.assignee_id) ids.add(c.assignee_id);
  return [...ids];
}

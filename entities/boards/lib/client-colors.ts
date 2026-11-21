import { BADGE_PALETTE_SIZE } from "@/kernel/ui/Badge";

/**
 * Each client's colour on the Workboard, as a Badge palette slot.
 *
 * The order is every client that has a live board, sorted by company id, so a
 * client keeps the same colour on every surface: the company-wide Workboard
 * and a team member's narrower one agree, which they would not if slots were
 * handed out per view. Sorting by id rather than name means a rename never
 * recolours anyone. A newly added client can shift the clients after it, and
 * past twelve clients the slots repeat.
 */
export function assignClientColors(clientIds: string[]): Map<string, number> {
  const ids = [...new Set(clientIds)].sort();
  return new Map(ids.map((id, i) => [id, i % BADGE_PALETTE_SIZE]));
}

import { listReviews, type ReviewListItem } from "@/entities/team/lib/reviews";

/**
 * What one person still has to write (AH.2.3): /team/reviews' to-do list,
 * asked by team member id for the Admin Home, whose reader is an admin rather
 * than a TeamActor. The id must be the signed-in viewer's own: this answers
 * "what is mine to write", never another person's queue.
 */
export async function reviewsToWrite(teamMemberId: string): Promise<ReviewListItem[]> {
  return (await listReviews({ teamMemberId })).todo;
}

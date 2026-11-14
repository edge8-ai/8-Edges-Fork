import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { one, type Embedded } from "@/kernel/config/embedded";

// Released client reviews, for the lists that sit beside a person's other
// reviews (CR.3.3, stories 33 and 56 to 58). A client review joins a list only
// once its owner released it, and never while the member is withdrawn: before
// that its member reads their own part on the review home, and nobody else
// reads anything of it (./rules, whatViewerSees). Each entry links to the
// member's own part, which /team/reviews/[id] reads through ./team-view, where
// the rules decide again what the viewer sees.

export type ReleasedClientReview = {
  /** The member's own part: the page's id. */
  partId: string;
  teamMemberId: string;
  cycleName: string;
  releasedAt: string;
};

type ReleasedRow = { cycle_id: string; team_member_id: string; released_at: string; review_cycles: Embedded<{ name: string }> };

/** The released client reviews of these team members, newest first. */
export async function releasedClientReviews(teamMemberIds: readonly string[]): Promise<ReleasedClientReview[]> {
  if (!teamMemberIds.length) return [];
  const released = mustRows(
    await companyOs
      .from("review_cycle_members")
      .select("cycle_id, team_member_id, released_at, review_cycles:review_cycles!cycle_id(name)")
      .in("team_member_id", [...teamMemberIds])
      .not("released_at", "is", null)
      .is("withdrawn_at", null),
    "[org/client-reviews] review_cycle_members",
  ) as unknown as ReleasedRow[];
  if (!released.length) return [];
  const parts = mustRows(
    await companyOs
      .from("performance_reviews")
      .select("id, team_member_id, review_cycle_id")
      .eq("review_type", "client")
      .eq("rater_kind", "self")
      .in("review_cycle_id", [...new Set(released.map((r) => r.cycle_id))])
      .in("team_member_id", [...new Set(released.map((r) => r.team_member_id))]),
    "[org/client-reviews] performance_reviews",
  ) as { id: string; team_member_id: string; review_cycle_id: string }[];
  const partOf = new Map(parts.map((p) => [`${p.review_cycle_id}:${p.team_member_id}`, p.id]));
  return released
    .flatMap((r): ReleasedClientReview[] => {
      const partId = partOf.get(`${r.cycle_id}:${r.team_member_id}`);
      return partId ? [{ partId, teamMemberId: r.team_member_id, cycleName: one(r.review_cycles)?.name ?? "Client review", releasedAt: r.released_at }] : [];
    })
    .sort((a, b) => b.releasedAt.localeCompare(a.releasedAt));
}

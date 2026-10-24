import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { reviewsHome } from "@/entities/team/lib/reviews/home";
import { ReviewsHome } from "@/entities/team/ui/reviews/ReviewsHome";

export const metadata = {
  title: "Reviews",
  description: "Performance reviews: yours, and your reports'.",
};

// /team/reviews — the actor's review home (TH.14). Everything is scoped to the
// actor's own team_member id (as subject or as reviewer-of-record) inside
// lib/reviews.ts; no client-supplied ids reach a query unchecked.
export default async function TeamReviewsPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("team.performance");
  const actor = await requireTeamMember();
  const home = await reviewsHome(actor);
  return (
    <div className="rv-page">
      <ReviewsHome home={home} />
    </div>
  );
}

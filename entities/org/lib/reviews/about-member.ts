import { companyOs } from "@/kernel/data/supabase";

// Every performance review about one team member, newest submitted last and the
// unsubmitted first, for the team assistant's "my reviews" tool. It is the exact
// query that tool built by hand while reviews lived in team; it moved here with
// performance_reviews (ADR 0025), so the tool asks org instead of reading org's
// table. Returns the builder: the caller keeps its own error handling.
const ABOUT_MEMBER_COLUMNS =
  "id, team_member_id, cycle_label, review_type, rater_kind, reviewer_name, status, submitted_at, period_start, period_end, overall_rating, rating_scale, ratings, achievements, improvements, comments, summary, decision, keeper, acknowledged_at";

export function reviewsAboutMember(teamMemberId: string) {
  return companyOs
    .from("performance_reviews")
    .select(ABOUT_MEMBER_COLUMNS)
    .eq("team_member_id", teamMemberId)
    .order("submitted_at", { ascending: false, nullsFirst: true });
}

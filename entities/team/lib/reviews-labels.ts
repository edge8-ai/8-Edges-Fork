// Pure, client-safe slice of the reviews domain: types and label maps with no
// server imports. lib/reviews.ts pulls in team-auth and the service-role
// Supabase client, so anything a Client Component needs (e.g. the shared
// ReviewHistoryTable) must live here instead, or the server code would be
// dragged into the browser bundle. lib/reviews re-exports all of these, so
// server callers keep importing from "@/entities/team/lib/reviews" unchanged.

export type ReviewType = "probation" | "midyear" | "renewal" | "adhoc" | "annual";
// self: the subject about themselves. manager: their manager-of-record, the
// only rater who finalizes and decides. reviewer: another team member talent
// added to the cycle. external: someone outside the team (a client contact,
// say), bound to an email and a signed link rather than an account.
export type RaterKind = "self" | "manager" | "reviewer" | "external";

export const RATER_LABEL: Record<RaterKind, string> = {
  self: "Self",
  manager: "Manager",
  reviewer: "Reviewer",
  external: "External",
};

export const REVIEW_TYPE_LABEL: Record<ReviewType, string> = {
  probation: "Probation review",
  midyear: "Mid-year check-in",
  renewal: "Renewal review",
  adhoc: "Review",
  annual: "Annual review",
};

// Survey decision labels -> stored enum.
export const DECISION_BY_LABEL: Record<string, string> = {
  "Continue to contract": "continue_to_contract",
  "Extend probation 30 days": "extend_probation",
  Discontinue: "discontinue",
  Renew: "renew",
  "Renew with changes": "renew_with_changes",
  "Do not renew": "do_not_renew",
};

export const DECISION_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(DECISION_BY_LABEL).map(([label, value]) => [value, label]),
);

// One review cycle collapsed to a single history row (self ✓ / manager ✓).
export type MemberReviewCycle = {
  cycleLabel: string | null;
  reviewType: ReviewType;
  date: string | null; // latest submitted_at across the cycle's rows
  hasSelf: boolean;
  hasManager: boolean;
  // Reviewers beyond self and manager on this cycle (team or external).
  extraReviewers: number;
  status: string; // most-advanced status across the cycle
  decision: string | null;
  keeper: boolean | null;
  // A row id to link the detail page at (prefer the manager row).
  linkId: string;
};

// Two forms feed the one performance_reviews table: the team member's
// self-assessment, and the manager's review. The manager form is the same for
// every cycle type; its decision section is shown or hidden per review_type at
// render time (see visibleReviewFields), so there is one manager survey, not
// one per type.
const SELF_SLUG = "perf-review-self";
const MANAGER_SLUG = "perf-review-manager";

export function reviewSurveySlug(row: { rater_kind: string; review_type: string }): string {
  return row.rater_kind === "self" ? SELF_SLUG : MANAGER_SLUG;
}

export const PERFORMANCE_REVIEW_SLUGS = new Set([SELF_SLUG, MANAGER_SLUG]);

// The manager form carries every decision field; keep only the ones whose
// config.show_when.types includes this cycle (fields without show_when always
// show). Applied identically in the survey page and the submit API so a hidden
// required field never blocks a submit. The self form has no gated fields, so
// this is a no-op there. Extra reviewers (team or external) fill the same form
// but never decide: every gated field is hidden for them, whatever the cycle.
export function visibleReviewFields<T extends { config: { show_when?: { types?: string[] } } | null }>(
  fields: T[],
  reviewType: string,
  raterKind: RaterKind = "manager",
): T[] {
  return fields.filter((f) => {
    const types = f.config?.show_when?.types;
    if (!types) return true;
    if (raterKind !== "manager") return false;
    return types.includes(reviewType);
  });
}

// The link a rater opens to fill their row. External rows carry their token;
// every other row relies on the rater's portal session.
export function reviewLinkPath(row: { id: string; rater_kind: string; review_type: string; access_token: string | null }): string {
  const slug = reviewSurveySlug(row);
  const token = row.rater_kind === "external" && row.access_token ? `&t=${encodeURIComponent(row.access_token)}` : "";
  return `/surveys/${slug}?review=${row.id}${token}`;
}

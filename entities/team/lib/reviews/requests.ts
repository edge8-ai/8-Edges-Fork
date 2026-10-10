import { randomBytes } from "crypto";
import { companyOs } from "@/kernel/data/supabase";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { one } from "@/kernel/config/embedded";
import { openReviewCycle, reviewLinkPath, REVIEW_COLUMNS, type ReviewRow } from "@/entities/team/lib/reviews";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";

// Review requests (docs: /workflows/review-requests). Talent opens a cycle for
// anyone and adds reviewers beyond the manager: another team member (bound to
// their team_members id) or someone outside the team, a client contact say,
// bound to an email plus a random token carried by the link. One row per
// reviewer; asking twice returns the same row's link. Callers authorize first
// (an admin, the talent director, or the subject's manager); nothing here reads
// a session.

export type ReviewerSpec =
  | { kind: "team"; teamMemberId: string }
  | { kind: "external"; email: string; name: string };

export type ReviewerLink = {
  reviewId: string;
  raterKind: "reviewer" | "external";
  label: string;
  link: string;
  created: boolean;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// first_name rides along for the search below, which matches any name a person goes by.
type PersonEmbed = NamedPerson & { first_name: string | null };
export type SubjectSummary = {
  teamMemberId: string;
  name: string;
  managerId: string | null;
  employmentStage: string | null;
  probationEndsOn: string | null;
};

// Team members whose name or email matches `query`, current staff only. The
// caller decides what to do with zero or several matches; this never guesses.
export async function findTeamMembers(query: string, limit = 5): Promise<SubjectSummary[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const { data, error } = await companyOs
    .from("team_members")
    .select(`id, manager_id, employment_stage, probation_ends_on, status, people!person_id(${NAME_COLUMNS}, first_name)`)
    .in("status", ["active", "on_leave", "notice", "pre_start"]);
  if (error) {
    console.error("[team/review-requests] team_members", error);
    return [];
  }
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    manager_id: string | null;
    employment_stage: string | null;
    probation_ends_on: string | null;
    people: PersonEmbed | PersonEmbed[] | null;
  }>;
  const hits = rows
    .map((r) => ({ row: r, person: one(r.people) }))
    .filter(({ person }) => {
      const hay = [person?.full_name, person?.first_name, person?.preferred_name, person?.email]
        .filter((x): x is string => !!x)
        .map((x) => x.toLowerCase());
      // An email query must match the email exactly; a name query matches any
      // name field as a whole word so "Ha" does not hit "Thanh".
      if (q.includes("@")) return hay.includes(q);
      return hay.some((h) => h === q || h.split(/\s+/).includes(q) || h.includes(q));
    })
    .slice(0, limit);
  return hits.map(({ row, person }) => ({
    teamMemberId: row.id,
    name: personName(person, "Team member"),
    managerId: row.manager_id,
    employmentStage: row.employment_stage,
    probationEndsOn: row.probation_ends_on,
  }));
}

// One team member by id, in the same shape the search returns.
export async function getSubject(teamMemberId: string): Promise<SubjectSummary | null> {
  if (!UUID_RE.test(teamMemberId)) return null;
  const { data, error } = await companyOs
    .from("team_members")
    .select(`id, manager_id, employment_stage, probation_ends_on, people!person_id(${NAME_COLUMNS}, first_name)`)
    .eq("id", teamMemberId)
    .maybeSingle();
  if (error) console.error("[team/review-requests] team_members", error);
  if (!data) return null;
  const r = data as unknown as { id: string; manager_id: string | null; employment_stage: string | null; probation_ends_on: string | null; people: PersonEmbed | PersonEmbed[] | null };
  return {
    teamMemberId: r.id,
    name: personName(one(r.people), "Team member"),
    managerId: r.manager_id,
    employmentStage: r.employment_stage,
    probationEndsOn: r.probation_ends_on,
  };
}

// The subject's current cycle: the newest one whose manager row is not yet
// finalized. Null when every cycle is closed or none exists.
export async function findOpenCycle(teamMemberId: string): Promise<{ cycleLabel: string; reviewType: string } | null> {
  if (!UUID_RE.test(teamMemberId)) return null;
  const { data, error } = await companyOs
    .from("performance_reviews")
    .select("cycle_label, review_type, status, created_at")
    .eq("team_member_id", teamMemberId)
    .eq("rater_kind", "manager")
    .eq("source", "portal")
    .not("cycle_label", "is", null)
    .in("status", ["open", "draft", "submitted"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) console.error("[team/review-requests] performance_reviews", error);
  const row = data as { cycle_label: string; review_type: string } | null;
  return row ? { cycleLabel: row.cycle_label, reviewType: row.review_type } : null;
}

// Ensure the subject has a cycle to add reviewers to: reuse the open one, or
// open a new one the way the scheduler would (self + manager rows). Someone on
// probation gets a probation cycle; anyone else an ad-hoc review for the month.
export async function ensureCycle(
  subject: SubjectSummary,
  todayISO: string,
): Promise<{ ok: true; cycleLabel: string; reviewType: string; opened: boolean } | { ok: false; error: string }> {
  const open = await findOpenCycle(subject.teamMemberId);
  if (open) return { ok: true, ...open, opened: false };
  if (!subject.managerId) return { ok: false, error: `${subject.name} has no manager on file, so no review cycle can be opened.` };
  const probation = subject.employmentStage === "probation";
  const reviewType = probation ? ("probation" as const) : ("adhoc" as const);
  const cycleLabel = probation ? `probation-${todayISO.slice(0, 4)}` : `adhoc-${todayISO.slice(0, 7)}`;
  const cycle = await openReviewCycle({ teamMemberId: subject.teamMemberId, managerId: subject.managerId, reviewType, cycleLabel });
  if (!cycle.managerId) return { ok: false, error: "Could not open a review cycle." };
  return { ok: true, cycleLabel, reviewType, opened: cycle.created > 0 };
}

// Add one reviewer to a cycle, or return the row that already exists for
// them. Team reviewers are keyed by team_members id, external ones by email
// (case-insensitive), matching the partial unique indexes on the table.
export async function addReviewer(input: {
  teamMemberId: string;
  cycleLabel: string;
  reviewType: string;
  reviewer: ReviewerSpec;
}): Promise<{ ok: true; link: ReviewerLink } | { ok: false; error: string }> {
  const origin = await getSiteOrigin();
  const base = {
    team_member_id: input.teamMemberId,
    cycle_label: input.cycleLabel,
    review_type: input.reviewType,
    rating_scale: "anchored-v1",
    status: "open",
    source: "portal",
  };

  if (input.reviewer.kind === "team") {
    if (input.reviewer.teamMemberId === input.teamMemberId) return { ok: false, error: "The subject cannot review themselves; they have a self-assessment." };
    const { data: existing, error: existingError } = await companyOs
      .from("performance_reviews")
      .select(REVIEW_COLUMNS)
      .eq("team_member_id", input.teamMemberId)
      .eq("cycle_label", input.cycleLabel)
      .eq("reviewer_id", input.reviewer.teamMemberId)
      .in("rater_kind", ["manager", "reviewer"])
      .limit(1)
      .maybeSingle();
    if (existingError) return { ok: false, error: existingError.message };
    const found = existing as ReviewRow | null;
    const name = await teamMemberName(input.reviewer.teamMemberId);
    if (found) return { ok: true, link: toLink(found, name, origin, false) };
    const { data, error } = await companyOs
      .from("performance_reviews")
      .insert({ ...base, rater_kind: "reviewer", reviewer_id: input.reviewer.teamMemberId })
      .select(REVIEW_COLUMNS)
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Could not add the reviewer." };
    return { ok: true, link: toLink(data as ReviewRow, name, origin, true) };
  }

  const email = input.reviewer.email.trim().toLowerCase();
  const name = input.reviewer.name.trim();
  if (!email.includes("@")) return { ok: false, error: "An external reviewer needs an email address." };
  if (!name) return { ok: false, error: "An external reviewer needs a name." };
  const { data: existing, error: existingError } = await companyOs
    .from("performance_reviews")
    .select(REVIEW_COLUMNS)
    .eq("team_member_id", input.teamMemberId)
    .eq("cycle_label", input.cycleLabel)
    .eq("rater_kind", "external")
    .ilike("reviewer_email", email)
    .limit(1)
    .maybeSingle();
  if (existingError) return { ok: false, error: existingError.message };
  const found = existing as ReviewRow | null;
  if (found) return { ok: true, link: toLink(found, found.reviewer_name ?? name, origin, false) };
  const { data, error } = await companyOs
    .from("performance_reviews")
    .insert({
      ...base,
      rater_kind: "external",
      reviewer_email: email,
      reviewer_name: name,
      // 32 random bytes, URL-safe: the link is the credential.
      access_token: randomBytes(32).toString("base64url"),
    })
    .select(REVIEW_COLUMNS)
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not add the reviewer." };
  return { ok: true, link: toLink(data as ReviewRow, name, origin, true) };
}

function toLink(row: ReviewRow, label: string, origin: string, created: boolean): ReviewerLink {
  return {
    reviewId: row.id,
    raterKind: row.rater_kind === "external" ? "external" : "reviewer",
    label,
    link: `${origin}${reviewLinkPath(row)}`,
    created,
  };
}

async function teamMemberName(teamMemberId: string): Promise<string> {
  const { data, error } = await companyOs
    .from("team_members")
    .select(`people!person_id(${NAME_COLUMNS}, first_name)`)
    .eq("id", teamMemberId)
    .maybeSingle();
  if (error) console.error("[team/review-requests] team_members", error);
  return personName(one((data?.people ?? null) as PersonEmbed | PersonEmbed[] | null), "Team member");
}

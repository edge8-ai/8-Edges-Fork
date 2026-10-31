"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/kernel/identity/access-request";
import { saigonToday } from "@/kernel/config/dates";
import { addReviewer, ensureCycle, getSubject, sendReviewLink } from "@/entities/team";

// Talent adds a reviewer to a subject's cycle from /admin/talent/reviews. The
// cycle is the subject's open one, or a fresh one opened the way the scheduler
// would. Every write goes through the team entity, which owns the table.
// The redirect carries the cycle key so the page reopens that row with the
// new link showing.

const back = (cycleKey: string | null, notice: string) =>
  redirect(`/admin/talent/reviews?${cycleKey ? `open=${encodeURIComponent(cycleKey)}&` : ""}notice=${encodeURIComponent(notice)}`);

export async function addReviewerAction(formData: FormData): Promise<void> {
  await requirePermission("team.reviews");
  const teamMemberId = String(formData.get("team_member_id") ?? "");
  const reviewerTeamMemberId = String(formData.get("reviewer_team_member_id") ?? "").trim();
  const name = String(formData.get("reviewer_name") ?? "").trim();
  const email = String(formData.get("reviewer_email") ?? "").trim();

  const subject = await getSubject(teamMemberId);
  if (!subject) return back(null, "Pick a team member first.");

  const cycle = await ensureCycle(subject, saigonToday());
  if (!cycle.ok) return back(null, cycle.error);
  const cycleKey = `${subject.teamMemberId}::${cycle.cycleLabel}`;

  const reviewer = reviewerTeamMemberId
    ? ({ kind: "team", teamMemberId: reviewerTeamMemberId } as const)
    : ({ kind: "external", email, name } as const);
  if (reviewer.kind === "external" && (!email || !name)) return back(cycleKey, "Give the reviewer a name and an email, or pick a team member.");

  const added = await addReviewer({ teamMemberId: subject.teamMemberId, cycleLabel: cycle.cycleLabel, reviewType: cycle.reviewType, reviewer });
  if (!added.ok) return back(cycleKey, added.error);
  revalidatePath("/admin/talent/reviews");
  return back(cycleKey, added.link.created ? `Added ${added.link.label}. Copy their link below.` : `${added.link.label} was already on this cycle; their link is below.`);
}

export async function sendReviewLinkAction(formData: FormData): Promise<void> {
  await requirePermission("team.reviews");
  const reviewId = String(formData.get("review_id") ?? "");
  const cycleKey = String(formData.get("cycle_key") ?? "") || null;
  const res = await sendReviewLink(reviewId);
  revalidatePath("/admin/talent/reviews");
  return back(cycleKey, res.ok ? `Link emailed to ${res.to}.` : res.error);
}

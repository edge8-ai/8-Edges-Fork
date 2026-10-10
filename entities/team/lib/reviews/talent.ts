import { companyOs } from "@/kernel/data/supabase";
import { PALETTE } from "@/kernel/config/palette";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { one } from "@/kernel/config/embedded";
import { REVIEW_COLUMNS, reviewLinkPath, REVIEW_TYPE_LABEL, type ReviewRow, type ReviewType } from "@/entities/team/lib/reviews";
import { EMAIL_SIGN_OFF } from "@/kernel/config/contacts";
import { greetingName, NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";
import { escapeHtml } from "@/kernel/config/html";

// The talent view of every review cycle (docs: /workflows/review-requests):
// one row per subject x cycle with each rater's status, so talent sees at a
// glance who has submitted, who is overdue, and which probation ends without
// a finalized manager review. Unscoped: the caller (requireAdmin) is the gate.

type PersonEmbed = NamedPerson;
export type CycleRater = {
  reviewId: string;
  raterKind: ReviewRow["rater_kind"];
  name: string;
  status: string;
  submittedAt: string | null;
  link: string;
  linkSentAt: string | null;
  email: string | null;
  // The submitted content, empty until the rater submits.
  ratings: Record<string, number>;
  achievements: string | null;
  improvements: string | null;
  comments: string | null;
};

export type TalentReviewCycle = {
  teamMemberId: string;
  subjectName: string;
  managerName: string | null;
  cycleLabel: string;
  reviewType: ReviewType;
  openedAt: string;
  probationEndsOn: string | null;
  // The manager row's status drives the cycle's state.
  managerStatus: string | null;
  decision: string | null;
  raters: CycleRater[];
  // A probation whose end date has passed (or is inside a week) with no
  // finalized manager review: the red mark on the screen.
  atRisk: boolean;
};

type MemberInfo = { name: string; email: string | null; managerId: string | null; probationEndsOn: string | null };

async function loadMembers(ids: string[]): Promise<Map<string, MemberInfo>> {
  const map = new Map<string, MemberInfo>();
  if (ids.length === 0) return map;
  const { data, error } = await companyOs
    .from("team_members")
    .select(`id, manager_id, probation_ends_on, people!person_id(${NAME_COLUMNS})`)
    .in("id", ids);
  if (error) console.error("[team/reviews/talent] team_members", error);
  for (const r of (data ?? []) as unknown as Array<{ id: string; manager_id: string | null; probation_ends_on: string | null; people: PersonEmbed | PersonEmbed[] | null }>) {
    const p = one(r.people);
    // The email is read for the recipient, never as the name: the name reaches
    // an external reviewer in their invitation (S.16.22).
    map.set(r.id, { name: personName(p && { ...p, email: null }, "Team member"), email: p?.email ?? null, managerId: r.manager_id, probationEndsOn: r.probation_ends_on });
  }
  return map;
}

export async function listTalentReviewCycles(todayISO: string): Promise<TalentReviewCycle[]> {
  const { data, error } = await companyOs
    .from("performance_reviews")
    .select(`${REVIEW_COLUMNS}, created_at`)
    .eq("source", "portal")
    .not("cycle_label", "is", null)
    .order("created_at", { ascending: false });
  if (error) console.error("[team/reviews/talent] performance_reviews", error);
  const rows = (data ?? []) as Array<ReviewRow & { created_at: string }>;

  const byCycle = new Map<string, Array<ReviewRow & { created_at: string }>>();
  for (const r of rows) {
    const key = `${r.team_member_id}::${r.cycle_label}`;
    byCycle.set(key, [...(byCycle.get(key) ?? []), r]);
  }
  const memberIds = new Set<string>();
  for (const r of rows) {
    memberIds.add(r.team_member_id);
    if (r.reviewer_id) memberIds.add(r.reviewer_id);
  }
  const members = await loadMembers([...memberIds]);
  const origin = await getSiteOrigin();
  const soon = new Date(`${todayISO}T00:00:00Z`);
  soon.setUTCDate(soon.getUTCDate() + 7);
  const soonISO = soon.toISOString().slice(0, 10);

  const cycles: TalentReviewCycle[] = [];
  for (const group of byCycle.values()) {
    const anchor = group[0];
    const subject = members.get(anchor.team_member_id);
    const manager = group.find((r) => r.rater_kind === "manager") ?? null;
    const order: Record<string, number> = { self: 0, manager: 1, reviewer: 2, external: 3 };
    const raters = [...group]
      .sort((a, b) => (order[a.rater_kind] ?? 9) - (order[b.rater_kind] ?? 9) || a.created_at.localeCompare(b.created_at))
      .map((r): CycleRater => {
        const tm = r.rater_kind === "self" ? members.get(r.team_member_id) : r.reviewer_id ? members.get(r.reviewer_id) : undefined;
        return {
          reviewId: r.id,
          raterKind: r.rater_kind,
          name: r.rater_kind === "external" ? r.reviewer_name ?? r.reviewer_email ?? "External" : tm?.name ?? "Team member",
          status: r.status,
          submittedAt: r.submitted_at,
          link: `${origin}${reviewLinkPath(r)}`,
          linkSentAt: r.link_sent_at,
          email: r.rater_kind === "external" ? r.reviewer_email : tm?.email ?? null,
          ratings: r.status === "open" || r.status === "draft" ? {} : r.ratings ?? {},
          achievements: r.status === "open" || r.status === "draft" ? null : r.achievements,
          improvements: r.status === "open" || r.status === "draft" ? null : r.improvements,
          comments: r.status === "open" || r.status === "draft" ? null : r.comments,
        };
      });
    const probationEndsOn = anchor.review_type === "probation" ? subject?.probationEndsOn ?? null : null;
    const finalized = manager?.status === "finalized" || manager?.status === "acknowledged";
    cycles.push({
      teamMemberId: anchor.team_member_id,
      subjectName: subject?.name ?? "Team member",
      managerName: subject?.managerId ? members.get(subject.managerId)?.name ?? null : null,
      cycleLabel: anchor.cycle_label as string,
      reviewType: anchor.review_type,
      openedAt: group.map((r) => r.created_at).sort()[0],
      probationEndsOn,
      managerStatus: manager?.status ?? null,
      decision: manager?.decision ?? null,
      raters,
      atRisk: !!probationEndsOn && !finalized && probationEndsOn <= soonISO,
    });
  }
  // Open cycles first, newest first; closed ones after.
  const closed = (c: TalentReviewCycle) => c.managerStatus === "finalized" || c.managerStatus === "acknowledged";
  cycles.sort((a, b) => Number(closed(a)) - Number(closed(b)) || b.openedAt.localeCompare(a.openedAt));
  return cycles;
}

// Current staff for the "add a team reviewer" picker.
export async function listCurrentTeamMembers(): Promise<Array<{ id: string; name: string }>> {
  const { data, error } = await companyOs
    .from("team_members")
    .select(`id, people!person_id(${NAME_COLUMNS})`)
    .in("status", ["active", "on_leave", "notice", "pre_start"]);
  if (error) console.error("[team/reviews/talent] team_members", error);
  return ((data ?? []) as unknown as Array<{ id: string; people: PersonEmbed | PersonEmbed[] | null }>)
    .map((r) => ({ id: r.id, name: personName(one(r.people), "Team member") }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Email a reviewer their link and stamp link_sent_at. The link itself is the
// same one talent can copy; sending is a convenience, never the only path.
export async function sendReviewLink(reviewId: string): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  const { data, error } = await companyOs.from("performance_reviews").select(REVIEW_COLUMNS).eq("id", reviewId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  const row = data as ReviewRow | null;
  if (!row || row.rater_kind === "self") return { ok: false, error: "Not found." };
  if (row.status === "finalized" || row.status === "acknowledged") return { ok: false, error: "This review is closed." };
  const members = await loadMembers([row.team_member_id, ...(row.reviewer_id ? [row.reviewer_id] : [])]);
  const subjectName = members.get(row.team_member_id)?.name ?? "a team member";
  const to = row.rater_kind === "external" ? row.reviewer_email : row.reviewer_id ? members.get(row.reviewer_id)?.email ?? null : null;
  if (!to) return { ok: false, error: "This reviewer has no email on file." };
  const typeName = REVIEW_TYPE_LABEL[row.review_type] ?? "Review";
  const link = `${await getSiteOrigin()}${reviewLinkPath(row)}`;
  // The rater's name is typed, so it is read as a nickname: one word greets them,
  // a full name (whose first word may be a family name) does not (S.16.16).
  const greeting = greetingName({ preferred_name: row.reviewer_name }, null);
  const sent = await sendTransactionalEmail({
    to,
    subject: `${typeName} for ${subjectName}: your input`,
    html:
      `<p>Hi${greeting ? ` ${escapeHtml(greeting)}` : ""},</p>` +
      `<p>We'd value your view of <strong>${escapeHtml(subjectName)}</strong>'s work as part of their ${typeName.toLowerCase()}. It takes about ten minutes: eleven quick ratings and a few open questions.</p>` +
      `<p><a href="${link}">Open the review</a></p>` +
      (row.rater_kind === "external"
        ? `<p style="font-size:13px;color:${PALETTE.greyMid};">This link is yours alone and needs no account. Please don't forward it.</p>`
        : "") +
      (EMAIL_SIGN_OFF ? `<p>Thank you,<br/>${EMAIL_SIGN_OFF}</p>` : `<p>Thank you.</p>`),
    logMeta: { source: "review-requests", kind: "review_link", reviewId: row.id },
  });
  if (!sent) return { ok: false, error: "The email could not be sent." };
  const { error: stampError } = await companyOs
    .from("performance_reviews")
    .update({ link_sent_at: new Date().toISOString() })
    .eq("id", row.id);
  if (stampError) console.error("[team/reviews/talent] performance_reviews", stampError);
  return { ok: true, to };
}

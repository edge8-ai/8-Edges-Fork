// Email notice on every FAST goal change, from whichever editor.
// Transparent is the T in FAST: adding, editing, or deleting a goal is never a
// silent act. Best effort by construction — the goal is already saved when
// these run, so a Resend outage must never surface as a failed save.
//
// No Lark post: the only coaching webhook (LARK_COACHING_WEBHOOK_URL) is the
// AIO Labz Coaching chat, an external programme, and a member's goal edit is
// internal 1-1 coaching. Khoa, 2026-09-17.
//
// The notice goes the other way for each side of the pair: a member editing
// their own goal tells their manager, and a coach, manager or admin editing
// someone's goal tells that person. Until K.13 only the first half existed,
// while /team/goals promised "every change emails your manager".

import { companyOs } from "@/kernel/data/supabase";
import { one } from "@/kernel/config/embedded";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { getManagerContact } from "@/kernel/identity/manager";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import type { CoachingGoal } from "./types";
import { escapeHtml } from "@/kernel/config/html";
import { OPS_EMAIL } from "@/kernel/config/contacts";

// Where the notice goes when the member has no manager on file (or the manager
// has no email). Never drop the notice: an unmanaged member's goals are exactly
// the ones nobody would otherwise see.
const FALLBACK_EMAIL = OPS_EMAIL;

export type GoalAction = "added" | "updated" | "deleted";

// Who hears about this change instead of the actor's own manager. Present for
// a coach/manager/admin edit (the goal's owner), absent for a member's own
// edit (their manager).
// Who a coach edit notifies. Only the address: the message names the actor, not
// the recipient, so a name here was carried and never read (S.16.6 review).
export type GoalRecipient = { email: string | null };

// The one rule the two paths share, pulled out so it can be asserted without a
// mail server: a coach edit reaches the goal's owner, a member edit reaches
// their manager, and neither is ever dropped — an unmanaged member's goals are
// exactly the ones nobody would otherwise see.
export function goalNotifyEmail(
  managerEmail: string | null | undefined,
  recipient: GoalRecipient | null | undefined,
): string {
  if (recipient) return recipient.email || FALLBACK_EMAIL;
  return managerEmail || FALLBACK_EMAIL;
}

// The person a coaching profile belongs to, for the coach-edit notice. Two
// hops rather than a nested embed: coaching_profiles -> team_members is an
// ordinary FK, but team_members carries the self-referencing manager_id that
// PostgREST resolves backwards, and keeping the hops explicit keeps this
// lookup out of that trap.
export async function goalOwnerContact(profileId: string): Promise<GoalRecipient | null> {
  if (!profileId) return null;
  const { data: prof, error: profError } = await companyOs
    .from("coaching_profiles")
    .select("team_member_id")
    .eq("id", profileId)
    .maybeSingle();
  if (profError) console.error("[team/coaching/goal-notify] coaching_profiles", profError);
  const teamMemberId = (prof as { team_member_id: string } | null)?.team_member_id ?? null;
  if (!teamMemberId) return null;

  const { data, error } = await companyOs
    .from("team_members")
    .select("people:people!person_id(email)")
    .eq("id", teamMemberId)
    .maybeSingle();
  if (error) console.error("[team/coaching/goal-notify] team_members", error);
  if (!data) return null;
  type P = { email: string | null };
  const person = one((data as unknown as Record<string, unknown>).people as P | P[] | null);
  if (!person) return null;
  return {
    email: person.email ?? null,
  };
}

// Everything a notice needs about a goal that is about to change or go away:
// who owns it and what it says. Read BEFORE a delete, because afterwards the
// row is gone and the notice would have nothing to name.
export async function goalNoticeTarget(
  goalId: string,
): Promise<{ recipient: GoalRecipient | null; title: string | null; status: string | null }> {
  const none = { recipient: null, title: null, status: null };
  if (!goalId) return none;
  const { data, error } = await companyOs
    .from("goals")
    .select("coaching_profile_id, title, status")
    .eq("id", goalId)
    .maybeSingle();
  if (error) console.error("[team/coaching/goal-notify] goals", error);
  if (!data) return none;
  const r = data as { coaching_profile_id: string; title: string; status: string };
  return { recipient: await goalOwnerContact(r.coaching_profile_id), title: r.title, status: r.status };
}

const VERB: Record<GoalAction, string> = {
  added: "added a FAST goal",
  updated: "updated a FAST goal",
  deleted: "deleted a FAST goal",
};

// Member-authored text lands in a manager's inbox as HTML; escape it.
// "12 clients / target 20 clients, by 30 Sep 2026" — the measure in one line,
// omitting whatever the member left blank.
function measureLine(g: {
  metricUnit: string | null;
  targetValue: number | null;
  currentValue: number | null;
  dueDate: string | null;
}): string | null {
  const unit = g.metricUnit ? ` ${g.metricUnit}` : "";
  const parts: string[] = [];
  if (g.currentValue !== null) parts.push(`now ${g.currentValue}${unit}`);
  if (g.targetValue !== null) parts.push(`target ${g.targetValue}${unit}`);
  if (g.dueDate) {
    parts.push(
      `by ${new Date(`${g.dueDate}T00:00:00`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })}`,
    );
  }
  return parts.length ? parts.join(", ") : null;
}

type GoalSummary = Pick<
  CoachingGoal,
  "title" | "status" | "quarterLabel" | "metricUnit" | "targetValue" | "currentValue" | "dueDate"
> & {
  // The company goal it aligns to, already resolved to a label. The caller
  // resolves it server-side (ladderLabelFor) — a client-supplied label would
  // let anyone claim alignment to anything in a manager's inbox.
  ladderLabel: string | null;
};

// Both a saved goal (CoachingGoal) and the input that produced one
// (MyGoalInput) carry these fields, so the delete path can report the row it
// just removed. The ladder label comes in separately: a saved goal has it
// resolved, an input has only the id.
export function summarize(
  g: Omit<GoalSummary, "ladderLabel">,
  ladderLabel: string | null,
): GoalSummary {
  return {
    title: g.title,
    status: g.status,
    quarterLabel: g.quarterLabel,
    metricUnit: g.metricUnit,
    targetValue: g.targetValue,
    currentValue: g.currentValue,
    dueDate: g.dueDate,
    ladderLabel,
  };
}

export function notifyGoalChange(
  actor: TeamActor,
  action: GoalAction,
  goal: GoalSummary,
  recipient: GoalRecipient | null = null,
): void {
  const measure = measureLine(goal);
  const cycle = goal.quarterLabel ? ` (${goal.quarterLabel})` : "";

  // A coach edit already knows its recipient, so it skips the manager lookup.
  (recipient ? Promise.resolve(null) : getManagerContact(actor))
    .then((mgr) =>
      sendTransactionalEmail({
        to: goalNotifyEmail(mgr?.email, recipient),
        subject: recipient
          ? `${actor.displayName} ${VERB[action]} for you`
          : `FAST goal ${action}: ${actor.displayName}`,
        html: `
          <p>${escapeHtml(actor.displayName)} ${VERB[action]}${
            recipient ? " for you" : ""
          }${escapeHtml(cycle)}.</p>
          <p><strong>${escapeHtml(goal.title)}</strong></p>
          ${measure ? `<p>${escapeHtml(measure)}</p>` : ""}
          ${goal.ladderLabel ? `<p>Aligns to: ${escapeHtml(goal.ladderLabel)}</p>` : ""}
          <p>Status: ${escapeHtml(goal.status)}</p>
          ${
            action === "deleted"
              ? "<p>The goal has been removed from their list.</p>"
              : "<p>See it in the Edge8 Team workspace under My Team &gt; Coaching, and talk it through in your next 1-1.</p>"
          }
        `,
        logMeta: { source: "team-fast-goals", action },
      }),
    )
    .catch(() => {});
}

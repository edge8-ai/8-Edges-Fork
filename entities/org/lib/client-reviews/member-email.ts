import { companyOs, type Json } from "@/kernel/data/supabase";
import type { TablesUpdate } from "@/kernel/data/supabase/database.types";
import { mustRows } from "@/kernel/data/read";
import { isUuid } from "@/kernel/config/slug";
import { one, type Embedded } from "@/kernel/config/embedded";
import { recordAudit } from "@/kernel/audit/audit";
import { workingDayStartMinute } from "@/kernel/messaging/business-hours";
import { resolvePick, type MemberEmailMode, type MemberEmailPick, type PlanClient } from "./member-email-plan";
import { emailMembersTheirClientReviewIsOpen } from "./notices";
import { isPartSubmitted, type ReviewPartFacts } from "./rules";

// The owner's choice of how a cycle's members are emailed (CR.5.4): now, at a time
// they pick, or by hand. Opening a cycle emails nobody (CR.5.3); the
// member's form is already in the team app and their Inbox, so all this
// decides is when the email that says so goes.
//
// Every write is a compare-and-set on the plan the overview showed, so a
// choice made in another tab is never overwritten unseen, and nothing changes
// once the email has gone (sent by the app, or marked sent by the owner). Emails go
// only to team members (./notices): the app never contacts anyone at the
// client.

export type MemberEmailResult =
  | { ok: true; outcome: "sent"; sent: number; of: number }
  | { ok: true; outcome: "scheduled"; at: string; moved: boolean }
  | { ok: true; outcome: "saved" }
  | { ok: false; error: string };

/** The plan as the overview showed it, which every write must still find. */
export type MemberEmailExpected = { mode: MemberEmailMode | null; scheduledAt: string | null };

type Actor = { personId: string; email: string };

type PlanCycle = {
  id: string;
  name: string;
  closed_at: string | null;
  due_date: string | null;
  member_email_mode: MemberEmailMode | null;
  member_email_scheduled_at: string | null;
  member_email_sent_at: string | null;
  member_email_manual_marked_sent_at: string | null;
  companies: Embedded<{ name: string | null; time_zone: string | null; working_day_start: string | null }>;
};

const CHANGED = "The email plan changed just now. Reload to see it.";

async function planCycle(cycleId: string): Promise<PlanCycle | null> {
  if (!isUuid(cycleId)) return null;
  return (
    (mustRows(
      await companyOs
        .from("review_cycles")
        .select(
          "id, name, closed_at, due_date, member_email_mode, member_email_scheduled_at, member_email_sent_at, member_email_manual_marked_sent_at, companies:companies!company_id(name, time_zone, working_day_start)",
        )
        .eq("id", cycleId)
        .limit(1),
      "[org/client-reviews] review_cycles",
    )[0] as unknown as PlanCycle | undefined) ?? null
  );
}

const sameInstant = (a: string | null, b: string | null) => (a === null || b === null ? a === b : Date.parse(a) === Date.parse(b));

/** Why the plan may not change now, or null when it may. */
function refusal(cycle: PlanCycle | null, expected: MemberEmailExpected): string | null {
  if (!cycle) return "That cycle was not found.";
  if (cycle.closed_at) return "This cycle is closed, so its members are not emailed.";
  if (cycle.member_email_sent_at) return "The members were already emailed.";
  if (cycle.member_email_manual_marked_sent_at) return "You already marked the email as sent.";
  if (cycle.member_email_mode !== expected.mode || !sameInstant(cycle.member_email_scheduled_at, expected.scheduledAt)) return CHANGED;
  return null;
}

/** The client's name, zone and day start, as the plan reads them. */
export function planClientOf(company: { name: string | null; time_zone: string | null; working_day_start: string | null } | null): PlanClient {
  return { name: company?.name ?? null, timeZone: company?.time_zone ?? null, zoneLabel: null, startMinute: workingDayStartMinute(company?.working_day_start) };
}

// The update narrowed to the plan the page showed, still unsent, on an open cycle.
function unchangedSince(patch: TablesUpdate<{ schema: "company_os" }, "review_cycles">, cycleId: string, expected: MemberEmailExpected) {
  let q = companyOs
    .from("review_cycles")
    .update(patch)
    .eq("id", cycleId)
    .is("closed_at", null)
    .is("member_email_sent_at", null)
    .is("member_email_manual_marked_sent_at", null);
  q = expected.mode === null ? q.is("member_email_mode", null) : q.eq("member_email_mode", expected.mode);
  q = expected.scheduledAt === null ? q.is("member_email_scheduled_at", null) : q.eq("member_email_scheduled_at", expected.scheduledAt);
  return q.select("id");
}

/** The members still in the cycle whose own part is not sent yet: the people the email asks for theirs. A withdrawn member is never one. */
export async function waitingMembers(cycleId: string): Promise<string[]> {
  const [memberRes, partRes] = await Promise.all([
    companyOs.from("review_cycle_members").select("team_member_id").eq("cycle_id", cycleId).is("withdrawn_at", null),
    companyOs.from("performance_reviews").select("team_member_id, status").eq("review_cycle_id", cycleId).eq("review_type", "client").eq("rater_kind", "self"),
  ]);
  const members = mustRows(memberRes, "[org/client-reviews] review_cycle_members") as { team_member_id: string }[];
  const parts = mustRows(partRes, "[org/client-reviews] performance_reviews") as unknown as ({ team_member_id: string } & ReviewPartFacts)[];
  const sent = new Set(parts.filter((p) => isPartSubmitted(p)).map((p) => p.team_member_id));
  return members.map((m) => m.team_member_id).filter((id) => !sent.has(id));
}

/**
 * Records the owner's choice. "Now" inside the client's working day emails the
 * members at once; outside it, and for a chosen time, the plan is stored for
 * the scheduler (CR.5.5) at the instant it resolves to. "I'll email them
 * myself" stores that the app sends nothing, and no reminder.
 */
export async function chooseMemberEmail(cycleId: string, pick: MemberEmailPick, expected: MemberEmailExpected, by: Actor, now = new Date()): Promise<MemberEmailResult> {
  const cycle = await planCycle(cycleId);
  const refused = refusal(cycle, expected);
  if (refused) return { ok: false, error: refused };
  const resolved = resolvePick(pick, planClientOf(one(cycle!.companies)), now);
  if (resolved.kind === "refused") return { ok: false, error: resolved.error };
  if (resolved.kind === "now") return sendNow(cycle!, expected, by, now);

  // The reminder needs a mode the app sends in, so choosing manual clears it
  // in the same write (review_cycles_member_reminder_needs_due_date).
  const patch =
    resolved.kind === "scheduled"
      ? { member_email_mode: "scheduled", member_email_scheduled_at: resolved.at }
      : { member_email_mode: "manual", member_email_scheduled_at: null, member_reminder_sent_at: null };
  const { data, error } = await unchangedSince(patch, cycleId, expected);
  if (error) return { ok: false, error: "Your choice could not be saved." };
  if (!data?.length) return { ok: false, error: CHANGED };
  await audit(cycleId, by, { action: "member_email_planned", mode: patch.member_email_mode, scheduledAt: patch.member_email_scheduled_at });
  return resolved.kind === "scheduled" ? { ok: true, outcome: "scheduled", at: resolved.at, moved: resolved.moved } : { ok: true, outcome: "saved" };
}

// The plan is claimed before a single email goes, so a second click or a
// second tab finds it sent and sends nothing: at most once. When not one email
// went, the claim is put back so the owner can try again.
async function sendNow(cycle: PlanCycle, expected: MemberEmailExpected, by: Actor, now: Date): Promise<MemberEmailResult> {
  const recipients = await waitingMembers(cycle.id);
  if (recipients.length === 0) return { ok: false, error: "Everyone has sent theirs, so there is nobody to email." };
  const at = now.toISOString();
  const { data, error } = await unchangedSince({ member_email_mode: "now", member_email_sent_at: at, member_email_scheduled_at: null }, cycle.id, expected);
  if (error) return { ok: false, error: "The email could not be sent." };
  if (!data?.length) return { ok: false, error: CHANGED };

  const { sent } = await emailMembersTheirClientReviewIsOpen(recipients, { clientName: one(cycle.companies)?.name ?? null, cycleName: cycle.name, dueDate: cycle.due_date });
  if (sent === 0) {
    const back = await companyOs
      .from("review_cycles")
      .update({ member_email_mode: expected.mode, member_email_scheduled_at: expected.scheduledAt, member_email_sent_at: null })
      .eq("id", cycle.id)
      .eq("member_email_sent_at", at)
      .select("id");
    if (back.error || !back.data?.length) return { ok: false, error: "No email could be sent, and the page could not be put back as it was. Reload to see it." };
    return { ok: false, error: "No email could be sent. Nothing was recorded, so you can try again." };
  }
  await audit(cycle.id, by, { action: "member_email_sent", sent, of: recipients.length });
  return { ok: true, outcome: "sent", sent, of: recipients.length };
}

/** "Don't send it": the plan goes back to not chosen, and the app sends nothing until the owner chooses again. */
export async function clearMemberEmail(cycleId: string, expected: MemberEmailExpected, by: Actor): Promise<MemberEmailResult> {
  const cycle = await planCycle(cycleId);
  const refused = refusal(cycle, expected);
  if (refused) return { ok: false, error: refused };
  if (expected.mode === null) return { ok: false, error: "No email is planned." };
  const { data, error } = await unchangedSince({ member_email_mode: null, member_email_scheduled_at: null, member_reminder_sent_at: null }, cycleId, expected);
  if (error) return { ok: false, error: "The email could not be cancelled." };
  if (!data?.length) return { ok: false, error: CHANGED };
  await audit(cycleId, by, { action: "member_email_plan_cleared", was: expected.mode });
  return { ok: true, outcome: "saved" };
}

/** The owner says they sent the message themselves. The app still sends nothing. */
export async function markMemberEmailSent(cycleId: string, by: Actor, now = new Date()): Promise<MemberEmailResult> {
  const cycle = await planCycle(cycleId);
  if (!cycle) return { ok: false, error: "That cycle was not found." };
  if (cycle.closed_at) return { ok: false, error: "This cycle is closed, so its members are not emailed." };
  if (cycle.member_email_mode !== "manual") return { ok: false, error: CHANGED };
  if (cycle.member_email_manual_marked_sent_at) return { ok: false, error: "You already marked the email as sent." };
  const { data, error } = await companyOs
    .from("review_cycles")
    .update({ member_email_manual_marked_sent_at: now.toISOString() })
    .eq("id", cycleId)
    .is("closed_at", null)
    .eq("member_email_mode", "manual")
    .is("member_email_manual_marked_sent_at", null)
    .select("id");
  if (error) return { ok: false, error: "It could not be marked as sent." };
  if (!data?.length) return { ok: false, error: CHANGED };
  await audit(cycleId, by, { action: "member_email_marked_sent" });
  return { ok: true, outcome: "saved" };
}

async function audit(cycleId: string, by: Actor, context: Record<string, Json>) {
  await recordAudit({ table: "review_cycles", recordId: cycleId, operation: "update", actor: by.email, context: { ...context, byPersonId: by.personId } });
}

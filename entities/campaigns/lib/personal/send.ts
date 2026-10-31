import { companyOs } from "@/kernel/data/supabase";
import { sendMarketingEmail } from "../marketing-email";
import { decideSend } from "../send-decision";
import { getAgent } from "./data";
import type { AgentRow } from "./types";
import { type GreetedPerson, GREETING_COLUMNS, greetingName } from "@/kernel/config/people-name";

// Sending a personal message: the same path a broadcast recipient takes
// (live consent recheck, Resend, the CRM interaction, the Resend id for the
// events webhook), one row at a time. Claiming flips the row from approved to
// sending in the same statement that selects it, so two ticks never mail the
// same person; a claim that went stale is returned to approved first.

const LOG = "[campaigns/personal/send]";
const STALE_CLAIM_MS = 20 * 60_000;
const DAY_MS = 86_400_000;

export type SendSummary = { claimed: number; sent: number; deferred: number; skipped: number; failed: number; writeFailures: number };

type Due = { id: string; agent_id: string; person_id: string; subject: string; body_md: string; people: (GreetedPerson & { email: string }) | (GreetedPerson & { email: string })[] | null };

async function claim(id: string, now: string): Promise<boolean> {
  const { data, error } = await companyOs.from("email_messages").update({ status: "sending", claimed_at: now, updated_at: now })
    .eq("id", id)
    .eq("status", "approved")
    .select("id");
  if (error) {
    console.error(`${LOG} claim of ${id} failed: ${error.message}`);
    return false;
  }
  return (data ?? []).length === 1;
}

// A tick died mid-send: its claims go back to approved after twenty minutes.
async function releaseStale(now: Date): Promise<void> {
  const { error } = await companyOs.from("email_messages").update({ status: "approved", claimed_at: null, updated_at: now.toISOString() })
    .eq("status", "sending")
    .lt("claimed_at", new Date(now.getTime() - STALE_CLAIM_MS).toISOString());
  if (error) console.error(`${LOG} releasing stale claims failed: ${error.message}`);
}

export async function sendDueMessages(opts: { now?: Date; limit?: number } = {}): Promise<SendSummary & { error?: string }> {
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const summary: SendSummary = { claimed: 0, sent: 0, deferred: 0, skipped: 0, failed: 0, writeFailures: 0 };
  await releaseStale(now);

  const { data, error } = await companyOs.from("email_messages")
    .select(`id, agent_id, person_id, subject, body_md, people(${GREETING_COLUMNS})`)
    .eq("status", "approved")
    .or(`send_after.is.null,send_after.lte.${nowIso}`)
    .order("send_after", { ascending: true })
    .limit(opts.limit ?? 25);
  if (error) return { ...summary, error: error.message };

  const agents = new Map<string, AgentRow | null>();
  const patch = async (id: string, row: Record<string, unknown>) => {
    const { error: patchError } = await companyOs.from("email_messages").update({ ...row, updated_at: new Date().toISOString() }).eq("id", id);
    if (patchError) {
      summary.writeFailures += 1;
      console.error(`${LOG} update of ${id} failed: ${patchError.message}`);
    }
  };

  for (const row of (data ?? []) as unknown as Due[]) {
    if (!(await claim(row.id, nowIso))) continue;
    summary.claimed += 1;
    const person = Array.isArray(row.people) ? row.people[0] : row.people;
    if (!person) {
      await patch(row.id, { status: "skipped", skip_reason: "person no longer exists" });
      summary.skipped += 1;
      continue;
    }

    const decision = await decideSend("personal", { personId: row.person_id, email: person.email }, now);
    if (decision.action === "skip") {
      await patch(row.id, { status: "skipped", skip_reason: decision.reason });
      summary.skipped += 1;
      continue;
    }
    if (decision.action === "defer") {
      // A retryAfter means the person already has today's email. This waits
      // until the same moment tomorrow rather than until the instant the cap
      // lifts, and deliberately: the cap lifts at company midnight, and nobody
      // should be sent a personal email at midnight. A day from now is never
      // earlier than that instant, so waiting longer breaks no rule. Anything
      // else is transient: back to approved for the next tick.
      await patch(row.id, decision.retryAfter
        ? { status: "approved", claimed_at: null, send_after: new Date(now.getTime() + DAY_MS).toISOString() }
        : { status: "approved", claimed_at: null });
      summary.deferred += 1;
      continue;
    }

    if (!agents.has(row.agent_id)) agents.set(row.agent_id, await getAgent(row.agent_id));
    const agent = agents.get(row.agent_id);
    const result = await sendMarketingEmail({
      to: person.email,
      personId: row.person_id,
      subject: row.subject,
      bodyMd: row.body_md,
      firstName: greetingName(person, null),
      from: agent?.fromEmail ?? null,
      replyTo: agent?.replyTo ?? null,
      logSource: "personal_email",
    });
    if (result.ok) {
      await patch(row.id, { status: "sent", sent_at: new Date().toISOString(), resend_email_id: result.resendEmailId, interaction_id: result.interactionId ?? null, error: null });
      summary.sent += 1;
    } else {
      // Left as failed, never retried: a retry loop against a bad address burns reputation.
      await patch(row.id, { status: "cancelled", error: result.error });
      summary.failed += 1;
      console.error(`${LOG} send to ${person.email} failed: ${result.error}`);
    }
  }
  return summary;
}

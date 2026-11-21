import { companyOs, type Json } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { one, type Embedded } from "@/kernel/config/embedded";
import { recordAudit } from "@/kernel/audit/audit";
import type { RoutineFailure } from "@/kernel/audit/routine-result";
import { inSendWindow, reminderDue, type MemberEmailMode } from "./member-email-plan";
import { planClientOf, waitingMembers } from "./member-email";
import { emailMembersTheirClientReviewIsOpen, emailMembersTheirReviewIsWaiting, type MailOutcome } from "./notices";

// The scheduler's half of the member email (CR.5.5), run every fifteen
// minutes by /api/cron/client-review-emails. Two jobs:
//
// 1. A scheduled email goes once its moment has come, inside the client's
//    working day (or the company's own hours when the client has no zone).
//    The moment was resolved into that day when the owner saved it; the window is
//    asked again here so a run that comes late never mails at night.
// 2. The due-date reminder goes once, on the client's day three working days
//    before the due date, to the members who have not sent their part, for a
//    cycle the app emailed (mode now or scheduled, and sent). A cycle with no
//    due date, one in manual mode, and one with no plan at all (opened before
//    CR.5) get none.
//
// Each send is at most once under concurrent runs: the cycle is claimed with
// a compare-and-set that returns the row, and only the run that got the row
// sends. When sends were tried and not one went, the claim is put back so the
// next run tries again; when no waiting member has an address, the claim
// stays and the cycle is recorded once (noAddress). Closed cycles send nothing, and a withdrawn member is never a
// recipient (waitingMembers). Every recipient is a team member (./notices):
// the app never contacts anyone at the client.

export type MemberEmailRun = {
  /** Cycles whose scheduled email went this run, and the emails it sent. */
  scheduledCycles: number;
  scheduledEmails: number;
  /** Cycles whose reminder went this run, and the emails it sent. */
  reminderCycles: number;
  reminderEmails: number;
  /** Scheduled emails due but held, because it is outside the client's working day. */
  held: number;
  /** The emails the run meant to send, against those that went (`done` below `expected` is an error run). */
  outcome: { expected: number; done: number; unit: "emails" };
  failures: RoutineFailure[];
};

type DueCycle = {
  id: string;
  name: string;
  due_date: string | null;
  member_email_mode: MemberEmailMode | null;
  member_email_scheduled_at: string | null;
  member_email_sent_at: string | null;
  companies: Embedded<{ name: string | null; time_zone: string | null; working_day_start: string | null }>;
};

const COLUMNS =
  "id, name, due_date, member_email_mode, member_email_scheduled_at, member_email_sent_at, companies:companies!company_id(name, time_zone, working_day_start)";

const ACTOR = "routine:client-review-emails";

/** No member to email, so nothing was sent and nothing failed. */
const NOBODY: MailOutcome = { sent: 0, addressed: 0 };

/** Open cycles whose scheduled email's moment has come and which no run has sent. A failed read raises: it is never "nothing to send". */
async function scheduledDue(now: Date): Promise<DueCycle[]> {
  return mustRows(
    await companyOs
      .from("review_cycles")
      .select(COLUMNS)
      .is("closed_at", null)
      .eq("member_email_mode", "scheduled")
      .is("member_email_sent_at", null)
      .lte("member_email_scheduled_at", now.toISOString()),
    "[org/client-reviews] scheduled member emails",
  ) as unknown as DueCycle[];
}

/** Open cycles the app emailed, with a due date and no reminder sent yet. A failed read raises. */
async function remindable(): Promise<DueCycle[]> {
  return mustRows(
    await companyOs
      .from("review_cycles")
      .select(COLUMNS)
      .is("closed_at", null)
      .in("member_email_mode", ["now", "scheduled"])
      .not("member_email_sent_at", "is", null)
      .not("due_date", "is", null)
      .is("member_reminder_sent_at", null),
    "[org/client-reviews] cycles to remind",
  ) as unknown as DueCycle[];
}

const cycleFacts = (c: DueCycle) => ({ clientName: one(c.companies)?.name ?? null, cycleName: c.name, dueDate: c.due_date });

/** Sends what is due at `now`. `dryRun` counts the emails without claiming or sending anything. */
export async function sendDueMemberEmails(now = new Date(), opts: { dryRun?: boolean } = {}): Promise<MemberEmailRun> {
  const run: MemberEmailRun = {
    scheduledCycles: 0,
    scheduledEmails: 0,
    reminderCycles: 0,
    reminderEmails: 0,
    held: 0,
    outcome: { expected: 0, done: 0, unit: "emails" },
    failures: [],
  };
  const at = now.toISOString();

  for (const c of await scheduledDue(now)) {
    if (!inSendWindow(now, planClientOf(one(c.companies)))) {
      run.held++;
      continue;
    }
    const recipients = await waitingMembers(c.id);
    if (opts.dryRun) {
      count(run, "scheduled", recipients.length, recipients.length);
      continue;
    }
    // Claimed only while the plan is still the one read: scheduled for that
    // moment, unsent, on an open cycle. A second run gets no row back.
    const claim = await companyOs
      .from("review_cycles")
      .update({ member_email_sent_at: at })
      .eq("id", c.id)
      .is("closed_at", null)
      .eq("member_email_mode", "scheduled")
      .eq("member_email_scheduled_at", c.member_email_scheduled_at!)
      .is("member_email_sent_at", null)
      .select("id");
    if (claim.error) {
      run.failures.push({ subject: c.id, step: "claim scheduled email", error: claim.error.message });
      continue;
    }
    if (!claim.data?.length) continue;
    // Everyone has sent theirs: the plan is done with nobody to email, so the
    // claim stays and nothing is retried.
    const mail = recipients.length ? await emailMembersTheirClientReviewIsOpen(recipients, cycleFacts(c)) : NOBODY;
    if (recipients.length && mail.sent === 0) {
      if (mail.addressed === 0) await noAddress(run, c.id, recipients.length, "scheduled email", "member_email_unaddressed");
      else await putBack(run, c.id, { member_email_sent_at: null }, "member_email_sent_at", at, "scheduled email");
      continue;
    }
    const sent = mail.sent;
    count(run, "scheduled", recipients.length, sent);
    await audit(c.id, { action: "member_email_sent", sent, of: recipients.length, scheduledAt: c.member_email_scheduled_at });
  }

  for (const c of await remindable()) {
    if (!reminderDue(c.due_date!, c.member_email_sent_at!, planClientOf(one(c.companies)), now)) continue;
    const recipients = await waitingMembers(c.id);
    if (opts.dryRun) {
      count(run, "reminder", recipients.length, recipients.length);
      continue;
    }
    // The due date and the mode are in the claim, so a cycle whose due date
    // moved or whose plan changed since the read is not reminded on old facts.
    const claim = await companyOs
      .from("review_cycles")
      .update({ member_reminder_sent_at: at })
      .eq("id", c.id)
      .is("closed_at", null)
      .eq("member_email_mode", c.member_email_mode!)
      .eq("due_date", c.due_date!)
      .not("member_email_sent_at", "is", null)
      .is("member_reminder_sent_at", null)
      .select("id");
    if (claim.error) {
      run.failures.push({ subject: c.id, step: "claim reminder", error: claim.error.message });
      continue;
    }
    if (!claim.data?.length) continue;
    const mail = recipients.length ? await emailMembersTheirReviewIsWaiting(recipients, { ...cycleFacts(c), dueDate: c.due_date! }) : NOBODY;
    if (recipients.length && mail.sent === 0) {
      if (mail.addressed === 0) await noAddress(run, c.id, recipients.length, "reminder", "member_reminder_unaddressed");
      else await putBack(run, c.id, { member_reminder_sent_at: null }, "member_reminder_sent_at", at, "reminder");
      continue;
    }
    const sent = mail.sent;
    count(run, "reminder", recipients.length, sent);
    await audit(c.id, { action: "member_reminder_sent", sent, of: recipients.length, dueDate: c.due_date });
  }
  return run;
}

function count(run: MemberEmailRun, kind: "scheduled" | "reminder", expected: number, done: number) {
  if (kind === "scheduled") {
    run.scheduledCycles++;
    run.scheduledEmails += done;
  } else {
    run.reminderCycles++;
    run.reminderEmails += done;
  }
  run.outcome.expected += expected;
  run.outcome.done += done;
}

// Members were waiting, but not one of them has an email address, so no email
// was tried. A retry would find the same addresses and fail the same way every
// fifteen minutes, so the claim stays: the cycle is recorded once, in the
// audit and as this run's one failure, and the owner can still email them by
// hand. Their part waits for them in the team app and the Inbox either way.
async function noAddress(run: MemberEmailRun, cycleId: string, waiting: number, what: string, action: string) {
  run.failures.push({ subject: cycleId, step: `send ${what}`, error: `none of the ${waiting} members waiting has an email address, so no email went; it is not retried` });
  await audit(cycleId, { action, waiting });
}

// Sends were tried and not one went, so the claim is undone and the next run
// tries again. Only this run's own claim is undone: the marker must still hold its time.
async function putBack(
  run: MemberEmailRun,
  cycleId: string,
  patch: { member_email_sent_at: null } | { member_reminder_sent_at: null },
  column: "member_email_sent_at" | "member_reminder_sent_at",
  at: string,
  what: string,
) {
  const back = await companyOs.from("review_cycles").update(patch).eq("id", cycleId).eq(column, at).select("id");
  run.failures.push({
    subject: cycleId,
    step: `send ${what}`,
    error: back.error || !back.data?.length ? "no email went, and the claim could not be put back, so it will not be retried" : "no email went; the next run tries again",
  });
}

async function audit(cycleId: string, context: Record<string, Json>) {
  await recordAudit({ table: "review_cycles", recordId: cycleId, operation: "update", actor: ACTOR, context });
}

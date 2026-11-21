import { businessDate, isTimeZone, monthDay, timeZoneLabel, zonedClock } from "@/kernel/config/dates";
import { planClientOf, type MemberEmailExpected } from "./member-email";
import { clientDay, reminderLine, whenLabel, type MemberEmailMode, type PlanClient } from "./member-email-plan";
import { memberEmailMessage } from "./notices";

// What the overview's "Email the members" card shows (CR.5.4): the plan's
// state, its words, and how many members have sent theirs. Built on the
// server, so every date and zone name is written once, in one runtime, and the
// page hydrates with the same words.

/**
 * Cycles opened before this Saigon day emailed their members at opening (the
 * rule before CR.5.3). Their plan is not chosen, but they must not say nobody
 * was told.
 */
const CHOICE_SINCE = "2026-11-18";

type MemberEmailState = "none" | "legacy" | "sent" | "scheduled" | "manual" | "manual_sent";

export type MemberEmailView = {
  state: MemberEmailState;
  /** The plan as shown, which every change must still find. */
  expected: MemberEmailExpected;
  /** "Nov 17": when the app emailed them, or when the owner marked their own message sent. */
  doneDay: string | null;
  /** "Wed 18 Nov, 9:00 am Eastern (9:00 pm in Saigon)", for a scheduled email. */
  scheduledLabel: string | null;
  /** The scheduled email's date and time at the client, to start the dialog from. */
  scheduledLocal: { date: string; time: string } | null;
  /** What the reminder will do, for an email the app sends. */
  reminderLine: string | null;
  dueDate: string | null;
  /** Members still in the cycle who have not sent theirs: the people the email goes to. */
  recipients: number;
  members: number;
  sentTheirs: number;
  /** The latest member to send theirs, and the day. */
  lastSent: { name: string; day: string } | null;
  client: PlanClient & { companyId: string | null };
  /** The message the owner copies to email them by hand. */
  message: string;
};

/** The cycle's columns the card reads. The plan columns may be missing, which reads as no plan chosen. */
export type PlanColumns = {
  name: string;
  company_id: string | null;
  opened_at: string;
  due_date?: string | null;
  member_email_mode?: MemberEmailMode | null;
  member_email_scheduled_at?: string | null;
  member_email_sent_at?: string | null;
  member_email_manual_marked_sent_at?: string | null;
};

type Company = { name: string | null; time_zone?: string | null; working_day_start?: string | null } | null;

function stateOf(c: PlanColumns): MemberEmailState {
  if (c.member_email_sent_at) return "sent";
  if (c.member_email_mode === "scheduled") return "scheduled";
  if (c.member_email_mode === "manual") return c.member_email_manual_marked_sent_at ? "manual_sent" : "manual";
  return businessDate(c.opened_at) < CHOICE_SINCE ? "legacy" : "none";
}

/** The card's view of one cycle, from its plan columns, its client and its members still in it with when each sent theirs. */
export function memberEmailView(cycle: PlanColumns, company: Company, members: { name: string; sentAt: string | null }[], origin: string): MemberEmailView {
  const base = planClientOf(company ? { name: company.name, time_zone: company.time_zone ?? null, working_day_start: company.working_day_start ?? null } : null);
  const client = { ...base, zoneLabel: isTimeZone(base.timeZone) ? timeZoneLabel(base.timeZone) : null, companyId: cycle.company_id };
  const state = stateOf(cycle);
  const dueDate = cycle.due_date ?? null;
  const scheduledAt = cycle.member_email_scheduled_at ?? null;
  const sentAt = cycle.member_email_sent_at ?? null;
  const sendsAt = state === "sent" ? sentAt : state === "scheduled" ? scheduledAt : null;
  const latest = members.filter((m) => m.sentAt !== null).sort((a, b) => Date.parse(b.sentAt!) - Date.parse(a.sentAt!))[0];
  const done = state === "sent" ? sentAt : state === "manual_sent" ? (cycle.member_email_manual_marked_sent_at ?? null) : null;
  return {
    state,
    expected: { mode: cycle.member_email_mode ?? null, scheduledAt },
    doneDay: done ? monthDay(businessDate(done)) : null,
    scheduledLabel: state === "scheduled" && scheduledAt ? whenLabel(scheduledAt, client) : null,
    scheduledLocal: state === "scheduled" && scheduledAt && isTimeZone(client.timeZone) ? localOf(scheduledAt, client.timeZone) : null,
    reminderLine: sendsAt ? reminderLine(dueDate, clientDay(sendsAt, client)) : null,
    dueDate,
    recipients: members.filter((m) => m.sentAt === null).length,
    members: members.length,
    sentTheirs: members.length - members.filter((m) => m.sentAt === null).length,
    lastSent: latest ? { name: latest.name, day: monthDay(businessDate(latest.sentAt!)) } : null,
    client,
    message: memberEmailMessage({ clientName: client.name, cycleName: cycle.name, dueDate }, origin),
  };
}

function localOf(at: string, timeZone: string): { date: string; time: string } {
  const { date, time } = zonedClock(at, timeZone);
  return { date, time };
}

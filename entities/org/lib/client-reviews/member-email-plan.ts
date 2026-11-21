import { addDays, BUSINESS_TIME_ZONE, clockLabel, isTimeZone, nextWorkday, shortDay, workdaysBefore, zonedClock, zonedInstant } from "@/kernel/config/dates";
import { inClientWorkingDay, inWorkingHours, minuteToTime, nextClientWorkingStart } from "@/kernel/messaging/business-hours";

// What the owner's choice of how the members are emailed comes to (CR.5.4): when it
// goes, in the client's time and in Saigon's, and the words the dialog and the
// overview say about it. Pure, so the dialog can show its live summary in the
// browser and the command can judge the same choice again on the server.
//
// The members are staffed with the client and work its hours, so the email
// reaches them inside the client's working day (CR.5 spec, "Send window"):
// "now" outside it waits for the next start of that day, and a chosen time
// outside it moves to the next start too. Without the client's time zone
// neither can be worked out, so those choices are refused with what to do.

export type MemberEmailMode = "now" | "scheduled" | "manual";

/** What the owner picked in the dialog. A blank time means the start of the client's working day. */
export type MemberEmailPick = { how: "now" } | { how: "scheduled"; date: string; time: string | null } | { how: "manual" };

/** The client as the plan needs it: its name, its zone (null until the owner sets it) and what people call that zone, and when its day starts. */
export type PlanClient = { name: string | null; timeZone: string | null; zoneLabel: string | null; startMinute: number };

type SendResolution =
  | { kind: "now" }
  | { kind: "scheduled"; at: string; moved: boolean }
  | { kind: "manual" }
  | { kind: "refused"; error: string; needsZone: boolean };

/** The reminder goes this many working days before the due date: approved by Khoa on 2026-11-17 (spec, "Khoa's rulings", 2). The scheduler in ./member-email-scheduler sends it. */
const REMINDER_WORKDAYS = 3;

const clientWord = (c: PlanClient) => c.name ?? "the client";

const workingDay = (c: PlanClient) => (isTimeZone(c.timeZone) ? { timeZone: c.timeZone, startMinute: c.startMinute } : null);

/** When the pick sends, judged at `now`; or why it cannot. */
export function resolvePick(pick: MemberEmailPick, client: PlanClient, now: Date): SendResolution {
  if (pick.how === "manual") return { kind: "manual" };
  const day = workingDay(client);
  const name = clientWord(client);
  if (pick.how === "now") {
    if (day) return inClientWorkingDay(now, day) ? { kind: "now" } : { kind: "scheduled", at: nextClientWorkingStart(now, day).toISOString(), moved: true };
    // With no zone, the company's own window is the only one known.
    if (inWorkingHours(now)) return { kind: "now" };
    return {
      kind: "refused",
      needsZone: true,
      error: `It is outside working hours, and ${name} has no time zone yet, so the start of their next working day cannot be worked out. Set it on ${name}'s page, or email them yourself.`,
    };
  }
  if (!day) return { kind: "refused", needsZone: true, error: `${name} has no time zone yet, so a time at ${name} cannot be worked out. Set it on ${name}'s page first.` };
  if (pick.time !== null && !/^\d{2}:\d{2}$/.test(pick.time)) return { kind: "refused", needsZone: false, error: "Pick a time, or leave it blank." };
  const chosen = zonedInstant(pick.date, pick.time ?? minuteToTime(day.startMinute), day.timeZone);
  if (!chosen) return { kind: "refused", needsZone: false, error: "Pick a date." };
  if (Date.parse(chosen) <= now.getTime()) return { kind: "refused", needsZone: false, error: "That time has already passed. Pick a later one, or email them now." };
  if (inClientWorkingDay(new Date(chosen), day)) return { kind: "scheduled", at: chosen, moved: false };
  return { kind: "scheduled", at: nextClientWorkingStart(new Date(chosen), day).toISOString(), moved: true };
}

/** The client's calendar day an instant falls on, or Saigon's when the client has no zone. */
export function clientDay(at: string | Date, client: PlanClient): string {
  return zonedClock(at, workingDay(client)?.timeZone ?? BUSINESS_TIME_ZONE).date;
}

/** The first working day after `now` at the client, the dialog's first date. */
export function firstDateToOffer(client: PlanClient, now: Date): string {
  return nextWorkday(addDays(clientDay(now, client), 1));
}

/** "Wed 18 Nov, 9:00 am Eastern (9:00 pm in Saigon)": an instant in the client's time, and in Saigon's beside it. */
export function whenLabel(at: string, client: PlanClient): string {
  const saigon = zonedClock(at, BUSINESS_TIME_ZONE);
  const day = workingDay(client);
  if (!day || day.timeZone === BUSINESS_TIME_ZONE) return `${shortDay(saigon.date)}, ${clockLabel(saigon.time)} in Saigon`;
  const there = zonedClock(at, day.timeZone);
  const shift = saigon.date > there.date ? " the next day" : saigon.date < there.date ? " the day before" : "";
  return `${shortDay(there.date)}, ${clockLabel(there.time)} ${client.zoneLabel ?? day.timeZone} (${clockLabel(saigon.time)} in Saigon${shift})`;
}

/** The client's calendar day the reminder goes on, for a cycle due on `dueDate`. */
const reminderDay = (dueDate: string) => workdaysBefore(dueDate, REMINDER_WORKDAYS);

/**
 * Whether a member email may go out at `now`: inside the client's working day
 * when the client has a time zone, and inside the company's own working hours
 * when it has none, the only window known then (CLAUDE.md, "Working hours").
 */
export function inSendWindow(now: Date, client: PlanClient): boolean {
  const day = workingDay(client);
  return day ? inClientWorkingDay(now, day) : inWorkingHours(now);
}

/**
 * Whether the due-date reminder goes at `now`, for a cycle due on `dueDate`
 * whose members were emailed at `sentAt` (CR.5.5). It goes on the reminder day
 * at the client, inside the send window. A run that missed that day (the cron
 * was down, or the window was shut) catches up later, up to the due date
 * itself and never after it. An email that went on or after the reminder day
 * has no reminder, as the dialog said when it was planned (reminderLine).
 */
export function reminderDue(dueDate: string, sentAt: string, client: PlanClient, now: Date): boolean {
  const remind = reminderDay(dueDate);
  const today = clientDay(now, client);
  if (clientDay(sentAt, client) >= remind) return false;
  if (today < remind || today > dueDate) return false;
  return inSendWindow(now, client);
}

/** What the reminder will do, for an email that goes on `sendDay` (the client's calendar day). */
export function reminderLine(dueDate: string | null, sendDay: string): string {
  if (!dueDate) return "No reminder: set a due date on the cycle to send one.";
  const remind = reminderDay(dueDate);
  if (remind <= sendDay) return `No reminder: the due date, ${shortDay(dueDate)}, is too close to the email.`;
  return `Reminder ${shortDay(remind)} to anyone who has not sent theirs. Due ${shortDay(dueDate)}.`;
}

/** The dialog's live line under the choice, and its main button. */
export function pickWords(
  pick: MemberEmailPick,
  resolved: SendResolution,
  ctx: { client: PlanClient; dueDate: string | null; recipients: number; now: Date },
): { summary: string; saveLabel: string } {
  const n = ctx.recipients;
  if (resolved.kind === "manual") return { summary: "The app sends nothing and no reminder. After you send it, press Mark as sent on the overview.", saveLabel: "Done" };
  if (resolved.kind === "now") {
    return { summary: `Goes now to ${n === 1 ? "them" : `all ${n}`}. ${reminderLine(ctx.dueDate, clientDay(ctx.now, ctx.client))}`, saveLabel: `Email ${n} now` };
  }
  if (resolved.kind === "scheduled") {
    const when = whenLabel(resolved.at, ctx.client);
    const reminder = reminderLine(ctx.dueDate, clientDay(resolved.at, ctx.client));
    const name = clientWord(ctx.client);
    const lead = !resolved.moved
      ? `Goes ${when}.`
      : pick.how === "now"
        ? `It is outside ${name}'s working day now, so it goes ${when}.`
        : `That is outside ${name}'s working day, so it goes ${when}.`;
    return { summary: `${lead} ${reminder}`, saveLabel: `Schedule for ${shortDay(clientDay(resolved.at, ctx.client))}` };
  }
  return { summary: resolved.error, saveLabel: pick.how === "now" ? `Email ${n} now` : pick.how === "scheduled" ? "Schedule" : "Done" };
}

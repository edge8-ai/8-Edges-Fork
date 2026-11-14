// What the owner's pages read about their own advances (AD.5). Every read is filtered
// to the owner in the query, and a failed read raises: an empty answer would say they
// have no advance when they are holding money. The one exception is the working-days
// count on the card, which is a nicety: the date itself is on the page either way.
import { holidayCalendar } from "@/entities/time-off";
import { businessDate, saigonToday } from "@/kernel/config/dates";
import { greetingName, GREETING_COLUMNS, type GreetedPerson } from "@/kernel/config/people-name";
import { mustRows } from "@/kernel/data/read";
import { companyOs } from "@/kernel/data/supabase";
import { peopleHolding } from "@/kernel/identity/people-holding";
import { advanceRowFrom, type AdvanceRow } from "./advance-lifecycle";
import { owedOf, type AdvanceFacts } from "./advance-card";
import { readAdvanceEvents, readAdvanceFiles, type AdvanceEvent, type AdvanceFile } from "./advance-history";
import { CLOSED_ADVANCE_STATUSES, OPEN_ADVANCE_STATUSES, returnStillReported } from "./advance-rules";
import { readOwnBankDetails } from "./own-bank-details";
import { selectReimbursementAdvances, selectReimbursementAdvanceTransfers, selectReimbursementClaims } from "./reads";
import { workingDaysLeft } from "./working-days";

const COLUMNS = "id, ref_no, status, person_id, purpose, amount_vnd, spend_ends_on, settle_by, submitted_at, decided_by, balance_vnd, spent_vnd, paid_out_at, trip_event_id, metadata, created_at";

/** Whoever approves, by first name when there is one, so a sentence can name them. "the approver" with none or several. */
export async function approverName(leaveOut: string): Promise<string> {
  const holders = (await peopleHolding("reimbursements.approve")).filter((id) => id !== leaveOut);
  if (holders.length !== 1) return "the approver";
  const { data, error } = await companyOs.from("people").select(GREETING_COLUMNS).eq("id", holders[0]).maybeSingle();
  if (error || !data) return "the approver";
  return greetingName(data as GreetedPerson, "the approver");
}

/** The account as a person recognises it, never in full. */
export function maskedAccount(bank: { bankName: string; accountNumber: string } | null): string | null {
  if (!bank) return null;
  const digits = bank.accountNumber.replace(/\D/g, "");
  if (!bank.bankName.trim() && !digits) return null;
  return [bank.bankName.trim(), digits ? `•••• ${digits.slice(-4)}` : ""].filter(Boolean).join(" · ");
}

type Raw = Record<string, unknown>;

function factsOf(raw: Raw, extras: { returnedVnd: number; claimStatus: string | null; reason: LastReason; paidTo: string | null; approver: string }): AdvanceFacts {
  const row = advanceRowFrom(raw);
  if (!row) throw new Error(`Advance ${String(raw.id)} has a status this code does not know.`);
  return {
    status: row.status,
    amountVnd: row.amountVnd,
    settleBy: row.settleBy,
    spentVnd: raw.spent_vnd === null || raw.spent_vnd === undefined ? null : Number(raw.spent_vnd),
    balanceVnd: row.balanceVnd,
    returnedVnd: extras.returnedVnd,
    claimStatus: extras.claimStatus,
    reason: extras.reason.reason,
    reinstatedWhy: extras.reason.reinstatedWhy,
    returnReported: returnStillReported(raw.metadata, extras.returnedVnd),
    paidTo: extras.paidTo,
    paidOutOn: raw.paid_out_at ? businessDate(String(raw.paid_out_at)) : null,
    approver: extras.approver,
  };
}

async function returnedOf(advanceId: string): Promise<number> {
  const rows = mustRows(await selectReimbursementAdvanceTransfers("amount_vnd").eq("advance_id", advanceId).eq("direction", "in"), "[reimbursements] an advance's returns");
  return rows.reduce((sum, r) => sum + Number(r.amount_vnd), 0);
}

async function claimStatusOf(advanceId: string): Promise<string | null> {
  const rows = mustRows(await selectReimbursementClaims("status").eq("advance_id", advanceId).limit(1), "[reimbursements] an advance's settlement");
  return rows[0] ? String(rows[0].status) : null;
}

type LastReason = { reason: string | null; reinstatedWhy: string | null };

/** The newest reason given, which is what sent it back or rejected it, and whether it is Finance's for putting it back. */
async function lastReasonOf(advanceId: string): Promise<LastReason> {
  const { data, error } = await companyOs.from("reimbursement_advance_events").select("reason, move").eq("advance_id", advanceId).not("reason", "is", null).order("created_at", { ascending: false }).limit(1);
  if (error) throw new Error(error.message);
  const newest = (data ?? [])[0] as { reason?: string | null; move?: string } | undefined;
  const reason = newest?.reason ?? null;
  return { reason, reinstatedWhy: newest?.move === "reinstate" ? reason : null };
}

async function daysLeft(settleBy: string | null): Promise<number | null> {
  if (!settleBy) return null;
  const today = saigonToday();
  try {
    return workingDaysLeft(today, settleBy, await holidayCalendar(today, settleBy >= today ? settleBy : today));
  } catch (err) {
    console.error("[reimbursements] the holiday calendar was not read for the card", err instanceof Error ? err.message : err);
    return null;
  }
}

export type MyAdvanceCard = { row: AdvanceRow; facts: AdvanceFacts; daysLeft: number | null };

/**
 * The person's open advance for My Claims, or null, and whether they may ask for
 * another. A person holds at most one open advance (the database's unique index), so
 * there is one card.
 */
export async function readMyOpenAdvance(personId: string): Promise<MyAdvanceCard | null> {
  const rows = mustRows(
    await selectReimbursementAdvances(COLUMNS).eq("person_id", personId).in("status", [...OPEN_ADVANCE_STATUSES]).order("created_at", { ascending: false }).limit(1),
    "[reimbursements] the open advance",
  );
  const raw = rows[0];
  if (!raw) return null;
  const id = String(raw.id);
  const [returnedVnd, claimStatus, reason, approver, bank] = await Promise.all([returnedOf(id), claimStatusOf(id), lastReasonOf(id), approverName(personId), readOwnBankDetails(personId)]);
  const facts = factsOf(raw, { returnedVnd, claimStatus, reason, paidTo: maskedAccount(bank), approver });
  return { row: advanceRowFrom(raw) as AdvanceRow, facts, daysLeft: await daysLeft(facts.settleBy) };
}

/** The advances that have ended, newest first: how a person gets back to a rejection's reason, how one ended, and its papers. */
export async function readMyClosedAdvances(personId: string): Promise<AdvanceRow[]> {
  const rows = mustRows(
    await selectReimbursementAdvances(COLUMNS).eq("person_id", personId).in("status", [...CLOSED_ADVANCE_STATUSES]).order("created_at", { ascending: false }),
    "[reimbursements] the closed advances",
  );
  return rows.map((raw) => advanceRowFrom(raw) as AdvanceRow);
}

type MyAdvanceDetail = MyAdvanceCard & {
  files: AdvanceFile[];
  events: AdvanceEvent[];
  tripEventId: string | null;
  owedVnd: number;
  reached: { askedOn: string | null; approvedBy: string | null; sentOn: string | null };
};

/** One advance in full, for its owner: null when it is not theirs, the same as when it does not exist. */
export async function readMyAdvance(advanceId: string, personId: string): Promise<MyAdvanceDetail | null> {
  const rows = mustRows(await selectReimbursementAdvances(COLUMNS).eq("id", advanceId).eq("person_id", personId).limit(1), "[reimbursements] an advance");
  const raw = rows[0];
  if (!raw) return null;
  const [returnedVnd, claimStatus, reason, approver, bank, files, events] = await Promise.all([
    returnedOf(advanceId),
    claimStatusOf(advanceId),
    lastReasonOf(advanceId),
    approverName(personId),
    readOwnBankDetails(personId),
    readAdvanceFiles(advanceId),
    readAdvanceEvents(advanceId),
  ]);
  const facts = factsOf(raw, { returnedVnd, claimStatus, reason, paidTo: maskedAccount(bank), approver });
  const row = advanceRowFrom(raw) as AdvanceRow;
  const latest = (move: string) => events.find((e) => e.move === move) ?? null;
  return {
    row,
    facts,
    daysLeft: await daysLeft(facts.settleBy),
    files,
    events,
    tripEventId: (raw.trip_event_id as string | null) ?? null,
    owedVnd: owedOf(facts),
    reached: {
      askedOn: row.submittedAt ? businessDate(row.submittedAt) : null,
      approvedBy: latest("approve")?.actorName ?? null,
      sentOn: facts.paidOutOn,
    },
  };
}

/** The calendar a form previews a deadline with, or null when it cannot be read: the form then says nothing, rather than a date that may be early. */
export async function calendarForPreview(today: string): Promise<{ date: string; name: string }[] | null> {
  const year = Number(today.slice(0, 4));
  try {
    return await holidayCalendar(`${year}-01-01`, `${year + 1}-12-31`);
  } catch (err) {
    console.error("[reimbursements] the holiday calendar was not read for the form", err instanceof Error ? err.message : err);
    return null;
  }
}

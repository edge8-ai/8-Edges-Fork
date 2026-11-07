// What a team member is paid: the questions other entities ask of
// compensation_sensitive and the changes they make to it (A.65, ADR 0018).
//
// CONFIDENTIAL. Every caller gates on the people.pay atom, or on the signed-in
// member asking about themselves, before it asks; authorization stays the
// caller's job. What this module adds is the other half: each question selects
// exactly the columns its caller read before this card (H1-DESIGN rule 7), so
// moving the reads behind finance's door handed nobody a pay column they did
// not already read. Two questions that look alike (the payment roll-up's rates
// and the contractor roster's) stay apart for that reason: the roster also
// reads the client-billable rate, and the roll-up never did.
//
// History is append-only. A change closes the current rows (is_current false,
// effective_to set) and inserts new ones, so the full wage history survives;
// the two commands below are the only writes, and both keep that rule.
import { companyOs } from "@/kernel/data/supabase";
import type { Result } from "@/kernel/data/result";

// The comp_type values these questions mean, as compensation_comp_type_check
// allows them.
const HOURLY = "hourly";
const OVERTIME = "overtime";
const BILLABLE = "billable";
const BASE_SALARY = "base_salary";

/** A contractor's current client-billable rate row, in US cents, or null. */
export async function currentBillableRate(teamMemberId: string) {
  return companyOs
    .from("compensation_sensitive")
    .select("amount_cents")
    .eq("team_member_id", teamMemberId)
    .eq("comp_type", BILLABLE)
    .eq("is_current", true)
    .maybeSingle();
}

/** The current hourly and overtime pay rates of these team members, for the monthly payment roll-up. */
export async function currentPayRates(teamMemberIds: string[]) {
  return companyOs
    .from("compensation_sensitive")
    .select("team_member_id, comp_type, amount_cents, currency")
    .in("team_member_id", teamMemberIds)
    .in("comp_type", [HOURLY, OVERTIME])
    .eq("is_current", true);
}

/** The current hourly, overtime and client-billable rates of these team members, for the contractor roster. */
export async function currentContractorRates(teamMemberIds: string[]) {
  return companyOs
    .from("compensation_sensitive")
    .select("team_member_id, comp_type, amount_cents, currency")
    .in("team_member_id", teamMemberIds)
    .in("comp_type", [HOURLY, OVERTIME, BILLABLE])
    .eq("is_current", true);
}

/** A contractor's own current hourly and overtime rates, as their work page shows them. */
export async function ownCurrentPayRates(teamMemberId: string) {
  return companyOs
    .from("compensation_sensitive")
    .select("comp_type, amount_cents, currency")
    .eq("team_member_id", teamMemberId)
    .eq("is_current", true)
    .in("comp_type", [HOURLY, OVERTIME]);
}

export type ContractorRates = {
  hourlyCents: number;
  overtimeCents: number;
  billableCents: number;
  /** The currency of the hourly and overtime rates; the billable rate is always US dollars. */
  currency: string;
  effectiveFrom: string;
  reason: string;
};

/** Supersedes a contractor's current hourly, overtime and billable rates with a new set. */
export async function replaceContractorRates(teamMemberId: string, rates: ContractorRates): Promise<Result> {
  const { error: closeErr } = await companyOs
    .from("compensation_sensitive")
    .update({ is_current: false, effective_to: rates.effectiveFrom, updated_at: new Date().toISOString() })
    .eq("team_member_id", teamMemberId)
    .in("comp_type", [HOURLY, OVERTIME, BILLABLE])
    .eq("is_current", true);
  if (closeErr) return { ok: false, error: closeErr.message };

  const rows = [
    { comp_type: HOURLY, amount_cents: rates.hourlyCents, currency: rates.currency },
    { comp_type: OVERTIME, amount_cents: rates.overtimeCents, currency: rates.currency },
    { comp_type: BILLABLE, amount_cents: rates.billableCents, currency: "usd" },
  ].map((r) => ({
    team_member_id: teamMemberId,
    comp_type: r.comp_type,
    amount_cents: r.amount_cents,
    currency: r.currency,
    pay_period: "hourly",
    effective_from: rates.effectiveFrom,
    is_current: true,
    change_reason: rates.reason,
  }));
  const { error: insErr } = await companyOs.from("compensation_sensitive").insert(rows);
  return insErr ? { ok: false, error: insErr.message } : { ok: true };
}

/** A team member's base-salary rows, newest first. */
export async function salaryHistory(teamMemberId: string) {
  return companyOs
    .from("compensation_sensitive")
    .select("id, salary_vnd, salary_usd_cents, effective_from, effective_to, is_current, change_reason, created_at")
    .eq("team_member_id", teamMemberId)
    .eq("comp_type", BASE_SALARY)
    .order("effective_from", { ascending: false })
    .order("created_at", { ascending: false });
}

export type SalaryChange = {
  salaryVnd: number;
  salaryUsdCents: number;
  /** "YYYY-MM-DD" */
  effectiveFrom: string;
  changeReason?: string | null;
};

/**
 * Closes a team member's current base salary on the day the new one starts and
 * records the new one, answering its id. Salary is held in both native VND and
 * US cents; the generic amount columns carry the US figure so a reader that
 * knows nothing of salaries still sees a value.
 */
export async function recordSalaryChange(
  teamMemberId: string,
  change: SalaryChange,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { error: closeErr } = await companyOs
    .from("compensation_sensitive")
    .update({ is_current: false, effective_to: change.effectiveFrom, updated_at: new Date().toISOString() })
    .eq("team_member_id", teamMemberId)
    .eq("comp_type", BASE_SALARY)
    .eq("is_current", true);
  if (closeErr) return { ok: false, error: closeErr.message };

  const { data, error } = await companyOs
    .from("compensation_sensitive")
    .insert({
      team_member_id: teamMemberId,
      comp_type: BASE_SALARY,
      pay_period: "monthly",
      amount_cents: change.salaryUsdCents,
      currency: "usd",
      salary_vnd: change.salaryVnd,
      salary_usd_cents: change.salaryUsdCents,
      effective_from: change.effectiveFrom,
      is_current: true,
      change_reason: change.changeReason ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}

/** Every compensation row of one team member, newest first: their own record of pay. */
export async function compensationHistoryOf(teamMemberId: string) {
  return companyOs
    .from("compensation_sensitive")
    .select(
      "team_member_id, comp_type, pay_period, amount_cents, currency, salary_vnd, salary_usd_cents, effective_from, effective_to, is_current, change_reason",
    )
    .eq("team_member_id", teamMemberId)
    .order("effective_from", { ascending: false });
}

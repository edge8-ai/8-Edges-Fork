// Server reads that assemble what the balance arithmetic needs and run it:
// each member's policy, the day they passed probation, their leave history,
// their manual adjustments and, where the policy says the imported figures
// stand, the opening balance anchored on 6 July 2026. One call
// serves one member (the /team page) or a whole roster (the admin history page
// and the client portal) so every surface computes the same number the same way.
import { companyOs } from "@/kernel/data/supabase";
import {
  computeLeaveBalance,
  type AdjustmentRow,
  type LeaveBalance,
  type UsageRow,
} from "./balance";
import { POLICY_COLUMNS, toPolicySummary, type LeavePolicySummary, type PolicyDbRow } from "./policy";
import { listHolidayDatesCovering } from "./holidays";
import { saigonToday } from "@/kernel/config/dates";

export type MemberLeave = {
  teamMemberId: string;
  policy: LeavePolicySummary | null;
  // The day the policy counts from: the day probation ended (the first
  // contract), or the start date when the policy says so or probation was
  // never recorded; the service year counts from here.
  anniversaryDate: string | null;
  startDate: string | null;
  // False when a policy that counts from probation end fell back to the start
  // date because none is recorded.
  probationRecorded: boolean;
  // The imported opening figures the balance walk started from, as recorded
  // (opening balance and carry-over), or null when the policy does not use them.
  opening: { date: string; openingDays: number; carryoverDays: number } | null;
  // Null when the member has no policy or the policy has no accrual rules,
  // so callers can fall back to whatever they showed before.
  balance: LeaveBalance | null;
};

type MemberRow = {
  id: string;
  leave_policy_id: string | null;
  probation_ends_on: string | null;
  start_date: string | null;
};
type TimeOffRow = {
  team_member_id: string;
  start_date: string;
  end_date: string;
  is_half_day: boolean;
  status: string;
  leave_type: string;
  hours: number | string | null;
  days: number | string | null;
};
type AdjustmentDbRow = {
  team_member_id: string;
  delta_days: number | string;
  effective_date: string;
  source: string | null;
  kind: string;
};

// The 6 July 2026 opening balances imported into leave_adjustments when Edge8
// moved to its own leave records. Policies with honourImportedBalance start from them.
const IMPORT_SOURCE = "legacy-import";
const today = () => saigonToday();
const toNum = (v: number | string | null): number | null => {
  if (v === null) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
};

export async function getLeavePolicies(): Promise<LeavePolicySummary[]> {
  const { data, error } = await companyOs.from("leave_policies").select(POLICY_COLUMNS).order("name");
  if (error) {
    console.error("[time-off] leave_policies read failed:", error.message);
    return [];
  }
  return ((data ?? []) as unknown as PolicyDbRow[]).map(toPolicySummary);
}

export async function getLeavePolicy(id: string): Promise<LeavePolicySummary | null> {
  const { data, error } = await companyOs.from("leave_policies").select(POLICY_COLUMNS).eq("id", id).maybeSingle();
  if (error) {
    console.error("[time-off] leave_policies read failed:", error.message);
    return null;
  }
  return data ? toPolicySummary(data as unknown as PolicyDbRow) : null;
}

// Balances for a set of members as of a day (today by default). Members whose
// id is unknown are simply absent from the map.
export async function getMemberLeave(teamMemberIds: string[], asOf = today()): Promise<Map<string, MemberLeave>> {
  const out = new Map<string, MemberLeave>();
  const ids = [...new Set(teamMemberIds)].filter(Boolean);
  if (ids.length === 0) return out;

  const [membersRes, policies, timeOffRes, adjRes] = await Promise.all([
    companyOs.from("team_members").select("id, leave_policy_id, probation_ends_on, start_date").in("id", ids),
    getLeavePolicies(),
    companyOs
      .from("time_off")
      .select("team_member_id, start_date, end_date, is_half_day, status, leave_type, hours, days")
      .in("team_member_id", ids),
    companyOs
      .from("leave_adjustments")
      .select("team_member_id, delta_days, effective_date, source, kind")
      .in("team_member_id", ids),
  ]);
  if (membersRes.error) console.error("[time-off] team_members read failed:", membersRes.error.message);
  if (timeOffRes.error) console.error("[time-off] time_off read failed:", timeOffRes.error.message);
  if (adjRes.error) console.error("[time-off] leave_adjustments read failed:", adjRes.error.message);

  const policyById = new Map(policies.map((p) => [p.id, p]));
  const usageByMember = new Map<string, UsageRow[]>();
  const allUsage: UsageRow[] = [];
  for (const r of (timeOffRes.data ?? []) as TimeOffRow[]) {
    const list = usageByMember.get(r.team_member_id) ?? [];
    const row: UsageRow = {
      startDate: r.start_date,
      endDate: r.end_date,
      isHalfDay: r.is_half_day,
      status: r.status,
      leaveType: r.leave_type,
      hours: toNum(r.hours),
      days: toNum(r.days),
    };
    list.push(row);
    allUsage.push(row);
    usageByMember.set(r.team_member_id, list);
  }

  // One query for the whole span of everybody's leave, rather than one per
  // member: the balance walk only needs holidays for rows that carry neither
  // hours nor a stored day count, and those are all inside this span.
  const holidays = await listHolidayDatesCovering(allUsage.flatMap((u) => [u.startDate, u.endDate]));
  const adjByMember = new Map<string, AdjustmentDbRow[]>();
  for (const a of (adjRes.data ?? []) as AdjustmentDbRow[]) {
    const list = adjByMember.get(a.team_member_id) ?? [];
    list.push(a);
    adjByMember.set(a.team_member_id, list);
  }

  for (const m of (membersRes.data ?? []) as MemberRow[]) {
    const policy = m.leave_policy_id ? policyById.get(m.leave_policy_id) ?? null : null;
    const fromStart = policy?.countsFrom === "start_date";
    const anniversaryDate = fromStart ? m.start_date ?? null : m.probation_ends_on ?? m.start_date ?? null;
    let balance: LeaveBalance | null = null;
    let opening: MemberLeave["opening"] = null;
    if (policy) {
      const rows = adjByMember.get(m.id) ?? [];
      // The import wrote the remaining balance as adjustment rows all dated on
      // the anchor day. They either become the walk's starting point or are
      // ignored; they are never added on top of a from-scratch walk.
      const imported = rows.filter((a) => a.source === IMPORT_SOURCE);
      const manual: AdjustmentRow[] = rows
        .filter((a) => a.source !== IMPORT_SOURCE)
        .map((a) => ({ effectiveDate: a.effective_date, deltaDays: toNum(a.delta_days) ?? 0 }));
      let anchor: { date: string; hours: number } | null = null;
      if (policy.honourImportedBalance && imported.length > 0) {
        const date = imported.map((a) => a.effective_date).sort().at(-1)!;
        const days = imported.reduce((s, a) => s + (toNum(a.delta_days) ?? 0), 0);
        anchor = { date, hours: days * policy.accrual.hoursPerDay };
        const carryover = imported
          .filter((a) => a.kind === "carryover")
          .reduce((s, a) => s + (toNum(a.delta_days) ?? 0), 0);
        opening = { date, openingDays: days - carryover, carryoverDays: carryover };
      }
      const computed = computeLeaveBalance({
        policy: policy.accrual,
        anniversaryDate,
        asOf,
        usage: usageByMember.get(m.id) ?? [],
        adjustments: manual,
        anchor,
        holidays,
      });
      balance = computed.hasRules ? computed : null;
    }
    out.set(m.id, {
      teamMemberId: m.id,
      policy,
      anniversaryDate,
      startDate: m.start_date,
      probationRecorded: fromStart || Boolean(m.probation_ends_on),
      opening,
      balance,
    });
  }
  return out;
}

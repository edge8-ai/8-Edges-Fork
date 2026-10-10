"use server";

import { revalidatePath } from "next/cache";
import { updateCompensationSensitive, insertCompensationSensitive } from "@/entities/finance";
import { companyOs } from "@/kernel/data/supabase";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import type { Result } from "@/kernel/data/result";
import { saigonToday } from "@/kernel/config/dates";

function refresh() {
  revalidatePath("/admin/operations/contractors");
}

export type ContractorWorkItem = {
  id: string;
  title: string;
  status: string;
  estimated_hours: number | string | null;
  actual_hours: number | string | null;
  created_at: string;
};

// Statuses waiting on an admin float to the top of the shelf list.
const NEEDS_ATTENTION = ["estimate_submitted", "work_submitted"];
const IN_FLIGHT = ["draft", "awaiting_estimate", "changes_requested", "scope_added", "approved"];

// Recent work requests for one contractor, lazy-loaded by the shelf.
// Sorted needs-attention → in-flight → closed, newest first within each.
export async function listContractorWorkRequests(personId: string): Promise<ContractorWorkItem[]> {
  await requirePermission("company-os.operations");
  const { data, error } = await companyOs
    .from("contractor_work_requests")
    .select("id, title, status, estimated_hours, actual_hours, created_at")
    .eq("person_id", personId)
    .order("created_at", { ascending: false })
    .limit(15);
  if (error) {
    console.error("[contractors] work requests load failed:", error.message);
    return [];
  }
  const rank = (s: string) => (NEEDS_ATTENTION.includes(s) ? 0 : IN_FLIGHT.includes(s) ? 1 : 2);
  return ((data ?? []) as ContractorWorkItem[]).sort((a, b) => rank(a.status) - rank(b.status));
}

// Update a contractor's hourly + overtime + billable rate. Effective-dated:
// the current compensation rows are superseded (is_current=false,
// effective_to=today), never mutated, so rate history stays queryable.
// Billable (what the client is invoiced per hour, default 100% markup) is
// always USD — client invoicing runs in USD — even when
// the internal rates are VND.
export async function updateContractorRates(input: {
  teamMemberId: string;
  hourlyRateCents: number;
  overtimeRateCents: number;
  billableRateCents: number;
  currency: string;
  changeReason?: string;
}): Promise<Result> {
  // Rates are pay data — gated like salaries, on people.pay (ADR 0014), not just admin.
  const access = await requirePermission("company-os.operations");
  const admin = access.user;
  if (!access.may("people.pay")) {
    return { ok: false, error: "Not authorized." };
  }

  if (!input.teamMemberId) return { ok: false, error: "Missing contractor." };
  const hourly = Math.round(input.hourlyRateCents);
  const overtime = Math.round(input.overtimeRateCents);
  const billable = Math.round(input.billableRateCents);
  if (!Number.isFinite(hourly) || hourly <= 0) return { ok: false, error: "Hourly rate must be greater than zero." };
  if (!Number.isFinite(overtime) || overtime <= 0)
    return { ok: false, error: "Overtime rate must be greater than zero." };
  if (!Number.isFinite(billable) || billable <= 0)
    return { ok: false, error: "Billable rate must be greater than zero." };
  const currency = (input.currency || "usd").toLowerCase();
  if (!["usd", "vnd"].includes(currency)) return { ok: false, error: "Currency must be USD or VND." };

  const today = saigonToday();
  const reason = input.changeReason?.trim() || "Rate update via admin";

  // Supersede current contractor-rate rows...
  const { error: closeErr } = await updateCompensationSensitive({ is_current: false, effective_to: today, updated_at: new Date().toISOString() })
    .eq("team_member_id", input.teamMemberId)
    .in("comp_type", ["hourly", "overtime", "billable"])
    .eq("is_current", true);
  if (closeErr) return { ok: false, error: closeErr.message };

  // ...then insert the new set.
  const rows = [
    { comp_type: "hourly", amount_cents: hourly, currency },
    { comp_type: "overtime", amount_cents: overtime, currency },
    { comp_type: "billable", amount_cents: billable, currency: "usd" },
  ].map((r) => ({
    team_member_id: input.teamMemberId,
    comp_type: r.comp_type,
    amount_cents: r.amount_cents,
    currency: r.currency,
    pay_period: "hourly",
    effective_from: today,
    is_current: true,
    change_reason: reason,
  }));
  const { error: insErr } = await insertCompensationSensitive(rows);
  if (insErr) return { ok: false, error: insErr.message };

  await recordAudit({
    table: "compensation_sensitive",
    recordId: input.teamMemberId,
    operation: "update",
    actor: admin.email,
    newData: {
      hourly_rate_cents: hourly,
      overtime_rate_cents: overtime,
      billable_rate_cents: billable,
      currency,
      change_reason: reason,
    },
    context: { kind: "contractor_rate_update" },
  });
  refresh();
  return { ok: true };
}

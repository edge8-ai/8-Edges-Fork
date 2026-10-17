"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/kernel/identity/access-request";
import { ACCRUAL_CADENCES, COUNTS_FROM, LEAVE_TYPES, YEAR_BASES, tiersSchema, updateLeavePolicies } from "@/entities/time-off";
import type { Result } from "@/kernel/data/result";

export type PolicyInput = {
  name: string;
  yearBasis: string;
  cadence: string;
  hoursPerDay: number;
  minIncrementHours: number;
  carryCapHours: number | null;
  bankLeaveTypes: string[];
  honourImportedBalance: boolean;
  countsFrom: string;
  policyText: string;
  tiers: { fromYear: number; hoursPerYear: number }[];
};

const inputSchema = z.object({
  name: z.string().trim().min(1, "Give the policy a name.").max(120),
  yearBasis: z.enum(YEAR_BASES),
  cadence: z.enum(ACCRUAL_CADENCES),
  hoursPerDay: z.number().positive().max(24),
  minIncrementHours: z.number().positive().max(24),
  carryCapHours: z.number().min(0).nullable(),
  bankLeaveTypes: z.array(z.enum(LEAVE_TYPES)).min(1, "Pick at least one leave type for the bank."),
  honourImportedBalance: z.boolean(),
  countsFrom: z.enum(COUNTS_FROM),
  policyText: z.string().max(20_000),
  tiers: tiersSchema,
});

// Rewrites a policy's rules and text. Every page that shows a balance under
// this policy recomputes on its next render, so the paths are revalidated
// rather than any figure stored.
export async function savePolicy(id: string, input: PolicyInput): Promise<Result> {
  await requirePermission("time-off.manage");
  if (!id) return { ok: false, error: "Missing policy." };

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first ? `${first.path.join(".") || "input"}: ${first.message}` : "Invalid input." };
  }
  const v = parsed.data;
  if (v.cadence !== "none" && v.tiers.length === 0)
    return { ok: false, error: "An accruing policy needs at least one entitlement tier." };
  const years = v.tiers.map((t) => t.fromYear);
  if (new Set(years).size !== years.length) return { ok: false, error: "Each tier needs a different starting year." };

  const { error } = await updateLeavePolicies({
    name: v.name,
    year_basis: v.yearBasis,
    accrual_cadence: v.cadence,
    hours_per_day: v.hoursPerDay,
    min_increment_hours: v.minIncrementHours,
    carry_cap_hours: v.carryCapHours,
    bank_leave_types: v.bankLeaveTypes,
    honour_imported_balance: v.honourImportedBalance,
    counts_from: v.countsFrom,
    policy_text: v.policyText.trim() === "" ? null : v.policyText,
    tiers: [...v.tiers].sort((a, b) => a.fromYear - b.fromYear),
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/operations/time-off/policies");
  revalidatePath(`/admin/operations/time-off/policies/${id}`);
  revalidatePath("/admin/operations/time-off/history");
  revalidatePath("/team/time-off");
  revalidatePath("/portal/time-off");
  return { ok: true };
}

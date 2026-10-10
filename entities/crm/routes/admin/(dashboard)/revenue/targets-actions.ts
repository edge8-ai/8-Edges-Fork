"use server";

import { revalidateSurfaces } from "@/kernel/shell/surface";
import { z } from "zod";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { PERIOD_KINDS, TARGET_METRICS, writeRevenueTarget } from "@/entities/crm/lib/revenue-metrics/targets";
import type { Result } from "@/kernel/data/result";

// Setting a company-level target from the Overview's Targets card. The
// figure is the company's for a period; there is no per-person variant and
// the input schema has nowhere to put one.

const Input = z.object({
  metric: z.enum(TARGET_METRICS),
  periodKind: z.enum(PERIOD_KINDS),
  periodStart: z.string().regex(/^\d{4}-\d{2}-01$/, "The period must start on the first of a month."),
  amount: z.number().finite().min(0).max(1_000_000_000),
  note: z.string().trim().max(200).nullable(),
});

export async function setRevenueTarget(raw: unknown): Promise<Result> {
  const { user: admin } = await requirePermission("crm.pipeline");
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid target." };
  const input = parsed.data;
  const r = await writeRevenueTarget({ ...input, note: input.note || null, createdBy: admin.email });
  if (!r.ok) return r;
  // A target is named by metric, period kind and period start, not a uuid, so
  // newData carries the key and the row names no record id (B.13).
  await recordAudit({ table: "revenue_targets", recordId: null, operation: input.amount > 0 ? "update" : "delete", actor: admin.email, newData: input });
  for (const p of ["/revenue", "/revenue/pipeline", "/revenue/demand", "/revenue/billing"]) revalidateSurfaces(p);
  return { ok: true };
}

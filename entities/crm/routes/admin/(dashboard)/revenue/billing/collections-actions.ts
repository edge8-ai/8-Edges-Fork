"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import type { Result } from "@/kernel/data/result";
import { writeChase } from "@/entities/crm/lib/revenue-metrics/collections";
import { CHASE_CHANNELS } from "@/entities/crm/lib/revenue-metrics/collections-vocab";

// Logging a chase against an overdue invoice's client (RF-5). The row it
// writes is a dated fact about an invoice — when it was chased, through what
// channel, and what was agreed next. There is no field for who chased it and
// none may be added: the queue is a list of invoices, not a scoreboard.

const Input = z.object({
  companyId: z.string().uuid("That invoice has no client mapped yet; map it in QuickBooks first."),
  invoiceRef: z.string().trim().min(1).max(64),
  channel: z.enum(CHASE_CHANNELS),
  note: z.string().trim().min(1, "Say what happens next.").max(300),
  // A shape test alone would accept 2026-99-99 while the message promises a
  // calendar date, so the parsed date has to round-trip to what was typed.
  nextDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "A next date must be a calendar date.")
    .refine((v) => new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v, "A next date must be a calendar date.")
    .nullable(),
});

export async function logCollectionsChase(raw: unknown): Promise<Result> {
  const { user: admin } = await requirePermission("crm.collections");
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const input = parsed.data;
  const r = await writeChase(input);
  if (!r.ok) return r;
  await recordAudit({
    table: "interactions",
    // The chase is named by its invoice reference, which newData carries; a
    // made-up key here is not a uuid and cost the row (B.13).
    recordId: null,
    operation: "insert",
    actor: admin.email,
    newData: { invoice: input.invoiceRef, channel: input.channel, nextDate: input.nextDate },
  });
  revalidatePath("/admin/revenue/billing");
  return { ok: true };
}

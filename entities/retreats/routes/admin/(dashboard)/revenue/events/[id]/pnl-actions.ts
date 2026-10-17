"use server";

import { revalidateSurfaces } from "@/kernel/shell/surface";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { insertPnlLine, updatePnlLine, deletePnlLine } from "@/entities/retreats/lib/event-pnl";
import type { PnlLineInput } from "@/entities/retreats/lib/event-pnl-shared";
import type { Result } from "@/kernel/data/result";

function refresh(eventId: string) {
  revalidateSurfaces(`/revenue/events/${eventId}`);
}

export async function addPnlLine(eventId: string, input: PnlLineInput): Promise<Result> {
  const { user: admin } = await requirePermission("retreats.events");
  const res = await insertPnlLine(eventId, input);
  if (!res.ok) return { ok: false, error: res.error };
  await recordAudit({
    table: "event_pnl_lines",
    recordId: res.id,
    operation: "insert",
    actor: admin.email,
    newData: { event_id: eventId, side: input.side, classification: input.classification },
    context: { via: "event_pnl_tab" },
  });
  refresh(eventId);
  return { ok: true };
}

export async function editPnlLine(eventId: string, id: string, input: PnlLineInput): Promise<Result> {
  const { user: admin } = await requirePermission("retreats.events");
  const res = await updatePnlLine(id, input);
  if (!res.ok) return { ok: false, error: res.error };
  await recordAudit({
    table: "event_pnl_lines",
    recordId: id,
    operation: "update",
    actor: admin.email,
    newData: { side: input.side, classification: input.classification },
    context: { via: "event_pnl_tab" },
  });
  refresh(eventId);
  return { ok: true };
}

export async function removePnlLine(eventId: string, id: string): Promise<Result> {
  const { user: admin } = await requirePermission("retreats.events");
  const res = await deletePnlLine(id);
  if (!res.ok) return { ok: false, error: res.error };
  await recordAudit({
    table: "event_pnl_lines",
    recordId: id,
    operation: "delete",
    actor: admin.email,
    context: { via: "event_pnl_tab" },
  });
  refresh(eventId);
  return { ok: true };
}

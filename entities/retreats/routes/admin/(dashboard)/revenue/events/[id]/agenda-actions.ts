"use server";

import { revalidateSurfaces } from "@/kernel/shell/surface";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import {
  insertAgendaBlock,
  updateAgendaBlock,
  deleteAgendaBlock,
  moveAgendaBlock,
  addAgendaStaff,
  removeAgendaStaff,
  cloneAgendaFromEvent,
  type AgendaBlockInput,
  type AgendaStaffRole,
} from "@/entities/retreats/lib/event-agenda";
import type { Result } from "@/kernel/data/result";

function refresh(eventId: string) {
  revalidateSurfaces(`/revenue/events/${eventId}`);
}

export async function createAgendaBlock(eventId: string, input: AgendaBlockInput): Promise<Result> {
  const { user: admin } = await requirePermission("retreats.events");
  const res = await insertAgendaBlock(eventId, input);
  if (!res.ok) return { ok: false, error: res.error };
  await recordAudit({
    table: "event_agenda_blocks",
    recordId: res.id,
    operation: "insert",
    actor: admin.email,
    newData: { event_id: eventId, day_index: input.dayIndex, title: input.title },
    context: { via: "event_agenda_tab" },
  });
  refresh(eventId);
  return { ok: true };
}

export async function editAgendaBlock(eventId: string, id: string, input: AgendaBlockInput): Promise<Result> {
  const { user: admin } = await requirePermission("retreats.events");
  const res = await updateAgendaBlock(id, input);
  if (!res.ok) return { ok: false, error: res.error };
  await recordAudit({
    table: "event_agenda_blocks",
    recordId: id,
    operation: "update",
    actor: admin.email,
    newData: { day_index: input.dayIndex, title: input.title },
    context: { event_id: eventId, via: "event_agenda_tab" },
  });
  refresh(eventId);
  return { ok: true };
}

export async function removeAgendaBlockAction(eventId: string, id: string): Promise<Result> {
  const { user: admin } = await requirePermission("retreats.events");
  const res = await deleteAgendaBlock(id);
  if (!res.ok) return { ok: false, error: res.error };
  await recordAudit({
    table: "event_agenda_blocks",
    recordId: id,
    operation: "delete",
    actor: admin.email,
    context: { event_id: eventId, via: "event_agenda_tab" },
  });
  refresh(eventId);
  return { ok: true };
}

export async function reorderAgendaBlock(eventId: string, id: string, dir: "up" | "down"): Promise<Result> {
  await requirePermission("retreats.events");
  const res = await moveAgendaBlock(id, dir);
  if (!res.ok) return { ok: false, error: res.error };
  refresh(eventId);
  return { ok: true };
}

export async function assignAgendaStaff(
  eventId: string,
  blockId: string,
  personId: string,
  role: AgendaStaffRole,
  note?: string | null,
): Promise<Result> {
  const { user: admin } = await requirePermission("retreats.events");
  if (!personId) return { ok: false, error: "Pick a staff member." };
  const res = await addAgendaStaff(blockId, personId, role, note);
  if (!res.ok) return { ok: false, error: res.error };
  await recordAudit({
    table: "event_agenda_staff",
    recordId: blockId,
    operation: "insert",
    actor: admin.email,
    newData: { block_id: blockId, person_id: personId, role },
    context: { event_id: eventId, via: "event_agenda_tab" },
  });
  refresh(eventId);
  return { ok: true };
}

export async function unassignAgendaStaff(eventId: string, staffId: string): Promise<Result> {
  const { user: admin } = await requirePermission("retreats.events");
  const res = await removeAgendaStaff(staffId);
  if (!res.ok) return { ok: false, error: res.error };
  await recordAudit({
    table: "event_agenda_staff",
    recordId: staffId,
    operation: "delete",
    actor: admin.email,
    context: { event_id: eventId, via: "event_agenda_tab" },
  });
  refresh(eventId);
  return { ok: true };
}

export async function cloneAgenda(eventId: string, sourceEventId: string, includeStaff: boolean): Promise<Result> {
  const { user: admin } = await requirePermission("retreats.events");
  if (!sourceEventId) return { ok: false, error: "Pick a source event." };
  const res = await cloneAgendaFromEvent(sourceEventId, eventId, { includeStaff });
  if (!res.ok) return { ok: false, error: res.error };
  await recordAudit({
    table: "event_agenda_blocks",
    recordId: eventId,
    operation: "insert",
    actor: admin.email,
    newData: { cloned_from: sourceEventId, blocks: res.blocks, include_staff: includeStaff },
    context: { event_id: eventId, via: "event_agenda_clone" },
  });
  refresh(eventId);
  return { ok: true };
}

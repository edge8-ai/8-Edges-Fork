// Server-only data layer for the retreat agenda (company_os.event_agenda_blocks
// + company_os.event_agenda_staff). Authorization is the caller's job — every
// server action wraps these with requireAdmin(). Pure types/constants/grouping
// live in ./event-agenda-shared (client-safe) and are re-exported here so server
// callers keep a single import.
//
// Design: docs/plans/2026-07-31-my-retreat-design.md

import { companyOs } from "@/kernel/data/supabase";
import { personName } from "@/kernel/config/people-name";
import {
  type AgendaBlock,
  type AgendaBlockInput,
  type AgendaStaff,
  type AgendaStaffRole,
  type AgendaPeriod,
  AGENDA_PERIODS,
  AGENDA_STAFF_ROLES,
} from "./event-agenda-shared";
import { one } from "@/kernel/config/embedded";

export * from "./event-agenda-shared";

type Err = { ok: false; error: string };
type Result<T = unknown> = ({ ok: true } & T) | Err;

type StaffRow = {
  id: string;
  person_id: string;
  role: string;
  note: string | null;
  people: { display_name: string | null; full_name: string | null } | { display_name: string | null; full_name: string | null }[] | null;
};

type BlockRow = {
  id: string;
  event_id: string;
  day_index: number;
  day_label: string | null;
  day_date: string | null;
  period: string | null;
  time_label: string | null;
  title: string;
  body: string | null;
  room: string | null;
  guest_visible: boolean;
  sort_order: number;
  event_agenda_staff: StaffRow[] | null;
};

const asPeriod = (v: string | null): AgendaPeriod | null =>
  v && (AGENDA_PERIODS as readonly string[]).includes(v) ? (v as AgendaPeriod) : null;
const asRole = (v: string): AgendaStaffRole =>
  (AGENDA_STAFF_ROLES as readonly string[]).includes(v) ? (v as AgendaStaffRole) : "other";

function mapStaff(r: StaffRow): AgendaStaff {
  return {
    id: r.id,
    personId: r.person_id,
    personName: r.people ? personName(one(r.people)) : null,
    role: asRole(r.role),
    note: r.note,
  };
}

function mapBlock(r: BlockRow): AgendaBlock {
  return {
    id: r.id,
    eventId: r.event_id,
    dayIndex: r.day_index,
    dayLabel: r.day_label,
    dayDate: r.day_date,
    period: asPeriod(r.period),
    timeLabel: r.time_label,
    title: r.title,
    body: r.body,
    room: r.room,
    guestVisible: r.guest_visible,
    sortOrder: r.sort_order,
    staff: (r.event_agenda_staff ?? []).map(mapStaff).sort((a, b) => a.role.localeCompare(b.role)),
  };
}

const SELECT =
  "id, event_id, day_index, day_label, day_date, period, time_label, title, body, room, guest_visible, sort_order, event_agenda_staff(id, person_id, role, note, people(display_name, full_name))";

export async function getEventAgenda(eventId: string): Promise<AgendaBlock[]> {
  const { data, error } = await companyOs
    .from("event_agenda_blocks")
    .select(SELECT)
    .eq("event_id", eventId)
    .order("day_index", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("getEventAgenda failed:", error.message);
    return [];
  }
  return (data as unknown as BlockRow[]).map(mapBlock);
}

function normalizeBlock(input: AgendaBlockInput) {
  return {
    day_index: Number.isInteger(input.dayIndex) && input.dayIndex > 0 ? input.dayIndex : 1,
    day_label: input.dayLabel?.trim() || null,
    day_date: input.dayDate || null,
    period: asPeriod(input.period ?? null),
    time_label: input.timeLabel?.trim() || null,
    title: input.title.trim(),
    body: input.body?.trim() || null,
    room: input.room?.trim() || null,
    guest_visible: input.guestVisible ?? true,
    sort_order: input.sortOrder ?? 0,
  };
}

export async function insertAgendaBlock(eventId: string, input: AgendaBlockInput): Promise<Result<{ id: string }>> {
  const base = normalizeBlock(input);
  if (!base.title) return { ok: false, error: "Block title is required." };

  // Default sort_order = end of the day if not given.
  if (input.sortOrder == null) {
    const { count, error: countErr } = await companyOs
      .from("event_agenda_blocks")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("day_index", base.day_index);
    if (countErr) return { ok: false, error: countErr.message };
    base.sort_order = count ?? 0;
  }

  const { data, error } = await companyOs
    .from("event_agenda_blocks")
    .insert({ event_id: eventId, ...base })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: (data as { id: string }).id };
}

export async function updateAgendaBlock(id: string, input: AgendaBlockInput): Promise<Result> {
  const base = normalizeBlock(input);
  if (!base.title) return { ok: false, error: "Block title is required." };
  const { error } = await companyOs.from("event_agenda_blocks").update(base).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteAgendaBlock(id: string): Promise<Result> {
  const { error } = await companyOs.from("event_agenda_blocks").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Swap sort_order with the adjacent block in the same day.
export async function moveAgendaBlock(id: string, dir: "up" | "down"): Promise<Result> {
  const { data: row, error: rErr } = await companyOs
    .from("event_agenda_blocks")
    .select("id, event_id, day_index, sort_order")
    .eq("id", id)
    .maybeSingle();
  if (rErr) return { ok: false, error: rErr.message };
  if (!row) return { ok: false, error: "Block not found." };

  const { data: siblings, error: sErr } = await companyOs
    .from("event_agenda_blocks")
    .select("id, sort_order")
    .eq("event_id", row.event_id)
    .eq("day_index", row.day_index)
    .order("sort_order", { ascending: true });
  if (sErr) return { ok: false, error: sErr.message };

  const list = (siblings ?? []) as { id: string; sort_order: number }[];
  const idx = list.findIndex((b) => b.id === id);
  const target = dir === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || target < 0 || target >= list.length) return { ok: true }; // at an edge

  const a = list[idx];
  const b = list[target];
  const [u1, u2] = await Promise.all([
    companyOs.from("event_agenda_blocks").update({ sort_order: b.sort_order }).eq("id", a.id),
    companyOs.from("event_agenda_blocks").update({ sort_order: a.sort_order }).eq("id", b.id),
  ]);
  const swapError = u1.error ?? u2.error;
  if (swapError) return { ok: false, error: swapError.message };
  return { ok: true };
}

export async function addAgendaStaff(
  blockId: string,
  personId: string,
  role: AgendaStaffRole,
  note?: string | null,
): Promise<Result> {
  const { error } = await companyOs
    .from("event_agenda_staff")
    .insert({ block_id: blockId, person_id: personId, role: asRole(role), note: note?.trim() || null });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "That person is already assigned to this block in that role." };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function removeAgendaStaff(staffId: string): Promise<Result> {
  const { error } = await companyOs.from("event_agenda_staff").delete().eq("id", staffId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Clone every block (and optionally staff) from one event's agenda into another.
// Day dates shift by the gap between the two events' start dates, so a cloned
// 4-day shape lands on the new retreat's dates; day_index/order are preserved.
export async function cloneAgendaFromEvent(
  sourceEventId: string,
  targetEventId: string,
  opts: { includeStaff?: boolean } = {},
): Promise<Result<{ blocks: number }>> {
  if (sourceEventId === targetEventId) return { ok: false, error: "Pick a different source event." };

  const source = await getEventAgenda(sourceEventId);
  if (source.length === 0) return { ok: false, error: "That event has no agenda to clone." };

  const { data: events, error: evErr } = await companyOs
    .from("events")
    .select("id, starts_at")
    .in("id", [sourceEventId, targetEventId]);
  if (evErr) return { ok: false, error: evErr.message };
  const startById = new Map((events ?? []).map((e) => [e.id, e.starts_at as string | null]));
  const shiftDays = dayGap(startById.get(sourceEventId) ?? null, startById.get(targetEventId) ?? null);

  let blockCount = 0;
  for (const b of source) {
    const ins = await insertAgendaBlock(targetEventId, {
      dayIndex: b.dayIndex,
      dayLabel: b.dayLabel,
      dayDate: shiftDate(b.dayDate, shiftDays),
      period: b.period,
      timeLabel: b.timeLabel,
      title: b.title,
      body: b.body,
      room: b.room,
      guestVisible: b.guestVisible,
      sortOrder: b.sortOrder,
    });
    if (!ins.ok) return { ok: false, error: ins.error };
    blockCount++;
    if (opts.includeStaff) {
      for (const s of b.staff) {
        await addAgendaStaff(ins.id, s.personId, s.role, s.note);
      }
    }
  }
  return { ok: true, blocks: blockCount };
}

// Whole-day gap between two ISO timestamps/dates (target - source), or 0 if
// either is missing.
function dayGap(sourceStart: string | null, targetStart: string | null): number {
  if (!sourceStart || !targetStart) return 0;
  const s = Date.parse(sourceStart.slice(0, 10));
  const t = Date.parse(targetStart.slice(0, 10));
  if (Number.isNaN(s) || Number.isNaN(t)) return 0;
  return Math.round((t - s) / 86400000);
}

function shiftDate(date: string | null, days: number): string | null {
  if (!date || days === 0) return date;
  const base = Date.parse(date.slice(0, 10));
  if (Number.isNaN(base)) return date;
  return new Date(base + days * 86400000).toISOString().slice(0, 10);
}

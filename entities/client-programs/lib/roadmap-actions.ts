"use server";

import { revalidatePath } from "next/cache";
import { companyOs } from "@/kernel/data/supabase";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import type { Result } from "@/entities/crm";
// Concrete files, not this entity's own door: both are re-exported by the
// door, so importing it here would make the barrel depend on itself.
import { BACKLOG_PRIORITIES, BACKLOG_STATUSES, ROADMAP_TEMPLATE, type BacklogPriority, type BacklogStatus } from "./client-backlog";
import { selectClientRoadmapGroups, selectClientBacklogItems, selectAiPrograms } from "./reads";
import { upsertClientRoadmapOverview, insertClientBacklogItems, insertClientRoadmapGroups, updateClientBacklogItems, updateClientRoadmapGroups } from "./writes";
import { slugify } from "@/kernel/config/slug";

const LOG = "[edges/client-roadmaps]";
const TABLE = "client_backlog_items";
const GROUPS_TABLE = "client_roadmap_groups";
const BASE = "/admin/edges/client-roadmaps";

function refresh() {
  revalidatePath(BASE);
}

export type BacklogItemInput = {
  group_key: string;
  // Optional AI Program tag. null/undefined = company-wide (the default).
  ai_program_id?: string | null;
  ref?: string;
  title: string;
  who?: string;
  today_state?: string;
  build_desc?: string;
  needs?: string[];
  token_low?: number | null;
  token_high?: number | null;
  edge8_priority?: BacklogPriority;
  status?: BacklogStatus;
};

function clean(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      out[k] = v.map((s) => String(s).trim()).filter(Boolean);
    } else if (typeof v === "string") {
      out[k] = v.trim() === "" ? null : v.trim();
    } else {
      out[k] = v;
    }
  }
  return out;
}

// Groups are per-company rows now: a key is valid when the company has an
// active group with that key.
async function groupExists(companyId: string, key: string | undefined): Promise<boolean> {
  if (!key) return false;
  const { data, error } = await selectClientRoadmapGroups("id")
    .eq("company_id", companyId)
    .eq("key", key)
    .is("archived_at", null)
    .maybeSingle();
  if (error) console.error(`${LOG} group lookup ${companyId}/${key} failed: ${error.message}`);
  return !!data;
}

// An AI Program tag is only valid when the program belongs to the same company.
async function programBelongs(companyId: string, programId: string): Promise<boolean> {
  const { data, error } = await selectAiPrograms("id")
    .eq("id", programId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) console.error(`${LOG} program lookup ${companyId}/${programId} failed: ${error.message}`);
  return !!data;
}

export async function createBacklogItem(
  companyId: string,
  input: BacklogItemInput,
): Promise<Result & { id?: string }> {
  const { user: admin } = await requirePermission("client-programs.roadmaps");
  if (!companyId) return { ok: false, error: "Pick a client first." };
  // Narrowed here, not inside groupExists, so the typed writer below sees a string.
  const groupKey = input.group_key;
  if (!groupKey || !(await groupExists(companyId, groupKey))) return { ok: false, error: "Invalid group." };
  const title = input.title?.trim();
  if (!title) return { ok: false, error: "Title is required." };
  if (input.edge8_priority && !BACKLOG_PRIORITIES.includes(input.edge8_priority)) {
    return { ok: false, error: "Invalid priority." };
  }
  if (input.status && !BACKLOG_STATUSES.includes(input.status)) {
    return { ok: false, error: "Invalid status." };
  }
  if (input.ai_program_id && !(await programBelongs(companyId, input.ai_program_id))) {
    return { ok: false, error: "Invalid AI Program." };
  }

  const row = {
    ...clean(input),
    company_id: companyId,
    group_key: groupKey,
    title,
    source: "edge8" as const,
    status: input.status ?? "accepted",
    sort_order: 999,
  };
  const { data, error } = await insertClientBacklogItems(row).select("id").single();
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: TABLE, recordId: data.id, operation: "insert", actor: admin.email, newData: row });
  refresh();
  return { ok: true, id: data.id };
}

export async function updateBacklogItem(id: string, patch: Partial<BacklogItemInput>): Promise<Result> {
  const { user: admin } = await requirePermission("client-programs.roadmaps");
  if (patch.group_key !== undefined || patch.ai_program_id) {
    const { data: item, error: itemError } = await selectClientBacklogItems("company_id").eq("id", id).maybeSingle();
    if (itemError) return { ok: false, error: itemError.message };
    if (!item) return { ok: false, error: "Item not found." };
    const companyId = (item as { company_id: string }).company_id;
    if (patch.group_key !== undefined && !(await groupExists(companyId, patch.group_key))) {
      return { ok: false, error: "Invalid group." };
    }
    if (patch.ai_program_id && !(await programBelongs(companyId, patch.ai_program_id))) {
      return { ok: false, error: "Invalid AI Program." };
    }
  }
  if (patch.edge8_priority && !BACKLOG_PRIORITIES.includes(patch.edge8_priority)) {
    return { ok: false, error: "Invalid priority." };
  }
  if (patch.status && !BACKLOG_STATUSES.includes(patch.status)) {
    return { ok: false, error: "Invalid status." };
  }
  const updates = { ...clean(patch), updated_at: new Date().toISOString() };
  if ("title" in updates && !updates.title) return { ok: false, error: "Title can't be empty." };

  const { error } = await updateClientBacklogItems(updates).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: TABLE, recordId: id, operation: "update", actor: admin.email, newData: patch });
  refresh();
  return { ok: true };
}

// Set the Edge8-proposed priority, the most common single edit, kept separate
// so the board pills can call it directly.
export async function setEdge8Priority(id: string, priority: BacklogPriority): Promise<Result> {
  if (!BACKLOG_PRIORITIES.includes(priority)) return { ok: false, error: "Invalid priority." };
  return updateBacklogItem(id, { edge8_priority: priority });
}

// Accept a client-proposed item into the plan (proposed -> accepted).
export async function acceptProposedItem(id: string): Promise<Result> {
  const { user: admin } = await requirePermission("client-programs.roadmaps");
  const { error } = await updateClientBacklogItems({ status: "accepted", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "proposed");
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: TABLE, recordId: id, operation: "update", actor: admin.email, newData: { status: "accepted" } });
  refresh();
  return { ok: true };
}

export async function archiveBacklogItem(id: string): Promise<Result> {
  const { user: admin } = await requirePermission("client-programs.roadmaps");
  const { error } = await updateClientBacklogItems({ archived_at: new Date().toISOString(), archived_by: admin.email })
    .eq("id", id)
    .is("archived_at", null);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: TABLE, recordId: id, operation: "archive", actor: admin.email });
  refresh();
  return { ok: true };
}

export async function restoreBacklogItem(id: string): Promise<Result> {
  const { user: admin } = await requirePermission("client-programs.roadmaps");
  const { error } = await updateClientBacklogItems({ archived_at: null, archived_by: null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: TABLE, recordId: id, operation: "restore", actor: admin.email });
  refresh();
  return { ok: true };
}

// The client-facing overview shown at the top of the roadmap. One row per
// company; upsert on company_id.
export async function saveRoadmapOverview(companyId: string, body: string): Promise<Result> {
  const { user: admin } = await requirePermission("client-programs.roadmaps");
  if (!companyId) return { ok: false, error: "Pick a client first." };
  const { error } = await upsertClientRoadmapOverview(
      { company_id: companyId, body, updated_at: new Date().toISOString(), updated_by: admin.email },
      { onConflict: "company_id" },
    );
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "client_roadmap_overview", recordId: companyId, operation: "update", actor: admin.email });
  refresh();
  return { ok: true };
}

// ── Roadmap groups ──────────────────────────────────────────────────

export type RoadmapGroupInput = {
  step_label?: string;
  title: string;
  intro?: string;
  // Optional AI Program tag. null/undefined = company-wide (the default).
  ai_program_id?: string | null;
};

export async function createRoadmapGroup(
  companyId: string,
  input: RoadmapGroupInput,
): Promise<Result & { id?: string }> {
  const { user: admin } = await requirePermission("client-programs.roadmaps");
  if (!companyId) return { ok: false, error: "Pick a client first." };
  const title = input.title?.trim();
  if (!title) return { ok: false, error: "Give the group a title." };
  if (input.ai_program_id && !(await programBelongs(companyId, input.ai_program_id))) {
    return { ok: false, error: "Invalid AI Program." };
  }

  // Unique key per company: slug of the title, suffixed on collision.
  const base = slugify(title) || "group";
  const { data: siblings, error: siblingsError } = await selectClientRoadmapGroups("key, sort_order")
    .eq("company_id", companyId);
  if (siblingsError) return { ok: false, error: siblingsError.message };
  const rows = (siblings ?? []) as Array<{ key: string; sort_order: number }>;
  const taken = new Set(rows.map((r) => r.key));
  let key = base;
  for (let n = 2; taken.has(key); n += 1) key = `${base}-${n}`;
  const sortOrder = rows.reduce((m, r) => Math.max(m, r.sort_order), 0) + 10;

  const row = {
    company_id: companyId,
    key,
    step_label: input.step_label?.trim() || null,
    title,
    intro: input.intro?.trim() || null,
    ai_program_id: input.ai_program_id ?? null,
    sort_order: sortOrder,
  };
  const { data, error } = await insertClientRoadmapGroups(row).select("id").single();
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: GROUPS_TABLE, recordId: data.id, operation: "insert", actor: admin.email, newData: row });
  refresh();
  return { ok: true, id: data.id };
}

export async function updateRoadmapGroup(id: string, patch: RoadmapGroupInput): Promise<Result> {
  const { user: admin } = await requirePermission("client-programs.roadmaps");
  const title = patch.title?.trim();
  if (!title) return { ok: false, error: "Title can't be empty." };
  const updates = {
    title,
    step_label: patch.step_label?.trim() || null,
    intro: patch.intro?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await updateClientRoadmapGroups(updates).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: GROUPS_TABLE, recordId: id, operation: "update", actor: admin.email, newData: updates });
  refresh();
  return { ok: true };
}

// Move a group one slot up or down in its company's roadmap by swapping
// sort_order with its neighbour.
export async function moveRoadmapGroup(id: string, direction: "up" | "down"): Promise<Result> {
  const { user: admin } = await requirePermission("client-programs.roadmaps");
  const { data: row, error: rowError } = await selectClientRoadmapGroups("id, company_id, sort_order")
    .eq("id", id)
    .maybeSingle();
  if (rowError) return { ok: false, error: rowError.message };
  const group = row as { id: string; company_id: string; sort_order: number } | null;
  if (!group) return { ok: false, error: "Group not found." };

  const { data: all, error: allError } = await selectClientRoadmapGroups("id, sort_order")
    .eq("company_id", group.company_id)
    .is("archived_at", null)
    .order("sort_order", { ascending: true });
  if (allError) return { ok: false, error: allError.message };
  const list = (all ?? []) as Array<{ id: string; sort_order: number }>;
  const idx = list.findIndex((g) => g.id === id);
  const swapWith = direction === "up" ? list[idx - 1] : list[idx + 1];
  if (idx < 0 || !swapWith) return { ok: true }; // already at the edge

  const now = new Date().toISOString();
  const results = await Promise.all([
    updateClientRoadmapGroups({ sort_order: swapWith.sort_order, updated_at: now }).eq("id", id),
    updateClientRoadmapGroups({ sort_order: list[idx].sort_order, updated_at: now }).eq("id", swapWith.id),
  ]);
  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false, error: failed.error.message };
  await recordAudit({ table: GROUPS_TABLE, recordId: id, operation: "update", actor: admin.email, newData: { moved: direction } });
  refresh();
  return { ok: true };
}

// Archive is only allowed once the group holds no unarchived items, so nothing
// a client can see ever loses its section.
export async function archiveRoadmapGroup(id: string): Promise<Result> {
  const { user: admin } = await requirePermission("client-programs.roadmaps");
  const { data: row, error: rowError } = await selectClientRoadmapGroups("id, company_id, key")
    .eq("id", id)
    .maybeSingle();
  if (rowError) return { ok: false, error: rowError.message };
  const group = row as { id: string; company_id: string; key: string } | null;
  if (!group) return { ok: false, error: "Group not found." };

  const { data: liveItems, error: liveItemsError } = await selectClientBacklogItems("id")
    .eq("company_id", group.company_id)
    .eq("group_key", group.key)
    .is("archived_at", null)
    .limit(1);
  if (liveItemsError) return { ok: false, error: liveItemsError.message };
  if ((liveItems ?? []).length > 0) {
    return { ok: false, error: "Move or archive this group's items first." };
  }

  const { error } = await updateClientRoadmapGroups({ archived_at: new Date().toISOString(), archived_by: admin.email })
    .eq("id", id)
    .is("archived_at", null);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: GROUPS_TABLE, recordId: id, operation: "archive", actor: admin.email });
  refresh();
  return { ok: true };
}

export async function restoreRoadmapGroup(id: string): Promise<Result> {
  const { user: admin } = await requirePermission("client-programs.roadmaps");
  const { error } = await updateClientRoadmapGroups({ archived_at: null, archived_by: null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: GROUPS_TABLE, recordId: id, operation: "restore", actor: admin.email });
  refresh();
  return { ok: true };
}

// Seed the classic Edge8 5-milestone layout for a client. Skips any key the company
// already has (including archived ones), so it is safe to run on a partly
// built roadmap.
export async function seedTemplateGroups(companyId: string): Promise<Result> {
  const { user: admin } = await requirePermission("client-programs.roadmaps");
  if (!companyId) return { ok: false, error: "Pick a client first." };
  const { data: existing, error: existingError } = await selectClientRoadmapGroups("key, sort_order")
    .eq("company_id", companyId);
  if (existingError) return { ok: false, error: existingError.message };
  const rows = (existing ?? []) as Array<{ key: string; sort_order: number }>;
  const taken = new Set(rows.map((r) => r.key));
  let sortOrder = rows.reduce((m, r) => Math.max(m, r.sort_order), 0);

  const inserts = ROADMAP_TEMPLATE.filter((t) => !taken.has(t.key)).map((t) => {
    sortOrder += 10;
    return { company_id: companyId, ...t, sort_order: sortOrder };
  });
  if (inserts.length === 0) return { ok: true };

  const { error } = await insertClientRoadmapGroups(inserts);
  if (error) return { ok: false, error: error.message };
  await recordAudit({
    table: GROUPS_TABLE,
    recordId: companyId,
    operation: "insert",
    actor: admin.email,
    newData: { seeded: inserts.map((i) => i.key) },
  });
  refresh();
  return { ok: true };
}

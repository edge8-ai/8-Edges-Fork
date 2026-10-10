// Roadmap writes from the team client hub. Same scope rule as every read in
// lib/team/clients.ts: the item's company must be in the actor's active staff
// assignments, resolved server-side. Deliberately narrower than the admin
// editor: team members create items and edit content/status. Edge8 priority,
// client priority, ordering, groups, and archive stay admin/client-only so the
// commercial levers keep one owner.

import { companyOs } from "@/kernel/data/supabase";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { recordAudit } from "@/kernel/audit/audit";
import { getActorClientCompanies, getActorEmail } from "@/entities/team/lib/hub-clients";
import { BACKLOG_STATUSES, type BacklogStatus } from "@/entities/client-programs";
import { selectClientBacklogItems, selectClientRoadmapGroups, selectAiPrograms, insertClientBacklogItems, updateClientBacklogItems } from "@/entities/client-programs";
import type { Result } from "@/kernel/data/result";

const TABLE = "client_backlog_items";

export type TeamRoadmapItemInput = {
  group_key: string;
  title: string;
  who?: string;
  today_state?: string;
  build_desc?: string;
  status?: BacklogStatus;
  // Tag the new item to one of the company's own AI Programs (validated on
  // create); omitted/null = company-wide. Create-only: re-tagging existing
  // items stays admin-only, so it is not part of the patch whitelist.
  ai_program_id?: string | null;
};

// Editable-by-team fields only. Anything else in a patch is dropped.
export type TeamRoadmapItemPatch = Partial<Omit<TeamRoadmapItemInput, "ai_program_id">>;

function cleanString(v: string | undefined): string | null | undefined {
  if (v === undefined) return undefined;
  const t = v.trim();
  return t === "" ? null : t;
}

async function actorScopeHas(actor: TeamActor, companyId: string): Promise<boolean> {
  const companies = await getActorClientCompanies(actor);
  return companies.some((c) => c.id === companyId);
}

async function groupExists(companyId: string, key: string): Promise<boolean> {
  const { data, error: groupError } = await selectClientRoadmapGroups("id")
    .eq("company_id", companyId)
    .eq("key", key)
    .is("archived_at", null)
    .maybeSingle();
  if (groupError) console.error("[team/hub] client_roadmap_groups", groupError);
  return Boolean(data);
}

export async function createRoadmapItemForActor(
  actor: TeamActor,
  companyId: string,
  input: TeamRoadmapItemInput,
): Promise<Result & { id?: string }> {
  if (!(await actorScopeHas(actor, companyId))) return { ok: false, error: "Not found." };
  const title = input.title?.trim();
  if (!title) return { ok: false, error: "Title is required." };
  if (!(await groupExists(companyId, input.group_key))) return { ok: false, error: "Invalid group." };
  if (input.status && !BACKLOG_STATUSES.includes(input.status)) {
    return { ok: false, error: "Invalid status." };
  }
  if (input.ai_program_id) {
    const { data: program, error: programError } = await selectAiPrograms("id")
      .eq("id", input.ai_program_id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (programError) console.error("[team/hub] ai_programs", programError);
    if (!program) return { ok: false, error: "Invalid AI Program." };
  }
  const email = await getActorEmail(actor);

  // source and edge8_priority ride the table defaults (edge8 / later);
  // sort_order 999 drops new items to the end of their group, like admin.
  const row = {
    company_id: companyId,
    group_key: input.group_key,
    title,
    who: cleanString(input.who) ?? null,
    today_state: cleanString(input.today_state) ?? null,
    build_desc: cleanString(input.build_desc) ?? null,
    status: input.status ?? "accepted",
    sort_order: 999,
    ai_program_id: input.ai_program_id ?? null,
  };
  const { data, error } = await insertClientBacklogItems(row).select("id").single();
  if (error) return { ok: false, error: error.message };
  await recordAudit({
    table: TABLE,
    recordId: data.id,
    operation: "insert",
    actor: email ?? actor.displayName,
    newData: row,
  });
  return { ok: true, id: data.id };
}

export async function updateRoadmapItemForActor(
  actor: TeamActor,
  itemId: string,
  patch: TeamRoadmapItemPatch,
): Promise<Result> {
  const { data: item, error: itemError } = await selectClientBacklogItems("id, company_id")
    .eq("id", itemId)
    .maybeSingle();
  if (itemError) console.error("[team/hub] client_backlog_items", itemError);
  if (!item) return { ok: false, error: "Not found." };
  const companyId = (item as { company_id: string }).company_id;
  if (!(await actorScopeHas(actor, companyId))) return { ok: false, error: "Not found." };

  if (patch.status && !BACKLOG_STATUSES.includes(patch.status)) {
    return { ok: false, error: "Invalid status." };
  }
  if (patch.group_key !== undefined && !(await groupExists(companyId, patch.group_key))) {
    return { ok: false, error: "Invalid group." };
  }

  // Whitelist: only the team-editable fields ever reach the update.
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { ok: false, error: "Title can't be empty." };
    updates.title = t;
  }
  if (patch.group_key !== undefined) updates.group_key = patch.group_key;
  if (patch.who !== undefined) updates.who = cleanString(patch.who);
  if (patch.today_state !== undefined) updates.today_state = cleanString(patch.today_state);
  if (patch.build_desc !== undefined) updates.build_desc = cleanString(patch.build_desc);
  if (patch.status !== undefined) updates.status = patch.status;

  const { error } = await updateClientBacklogItems(updates).eq("id", itemId);
  if (error) return { ok: false, error: error.message };
  const email = await getActorEmail(actor);
  await recordAudit({
    table: TABLE,
    recordId: itemId,
    operation: "update",
    actor: email ?? actor.displayName,
    newData: updates,
  });
  return { ok: true };
}

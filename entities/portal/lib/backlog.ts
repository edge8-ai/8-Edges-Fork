// Client-facing backlog / AI Program view. Company-scoped: a portal member sees
// their own company's backlog and can (a) set the client priority on any item and
// (b) propose new items for Edge8 to accept. Every read goes through portalRead,
// every write re-checks the item belongs to the actor's company scope before
// touching it (IDOR guard) — see entities/portal/lib/data.ts.

import { companyOs } from "@/kernel/data/supabase";
import { selectClientRoadmapGroups, programInCompany, insertClientBacklogItems, updateClientBacklogItems } from "@/entities/client-programs";
import type { PortalActor } from "@/kernel/identity/portal-auth";
import { portalRead, assertInScope } from "@/entities/portal/lib/data";
import { isPortalAdmin, canContribute, ROLE_DENIED } from "@/entities/portal/lib/roles";
import {
  BACKLOG_SELECT,
  ROADMAP_GROUPS_SELECT,
  groupRank,
  isBacklogPriority,
  type BacklogItem,
  type BacklogPriority,
  type RoadmapGroup,
} from "@/entities/client-programs";
import type { Result } from "@/kernel/data/result";

export async function hasBacklog(actor: PortalActor): Promise<boolean> {
  if (actor.companyScope.length === 0) return false;
  const { data, error: clientBacklogItemsError } = await portalRead(actor, "client_backlog_items", "id")
    .is("archived_at", null)
    .limit(1);
  if (clientBacklogItemsError) console.error("[portal] client_backlog_items read failed:", clientBacklogItemsError.message);
  return (data ?? []).length > 0;
}

// The actor's roadmap groups (their company's sections), in display order.
// The client-facing roadmap overview Edge8 writes on the admin roadmap. One
// row per company; null when none has been written yet.
export async function getRoadmapOverviewForActor(actor: PortalActor, companyId: string): Promise<string | null> {
  if (!actor.companyScope.includes(companyId)) return null;
  const { data, error } = await portalRead(actor, "client_roadmap_overview", "body")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) {
    console.error("[portal/backlog] client_roadmap_overview", error);
    return null;
  }
  return ((data as { body: string | null } | null)?.body ?? "").trim() || null;
}

export async function getGroupsForActor(actor: PortalActor): Promise<RoadmapGroup[]> {
  if (actor.companyScope.length === 0) return [];
  const { data, error: clientRoadmapGroupsError } = await portalRead(actor, "client_roadmap_groups", ROADMAP_GROUPS_SELECT)
    .is("archived_at", null)
    .order("sort_order", { ascending: true });
  if (clientRoadmapGroupsError) console.error("[portal] client_roadmap_groups read failed:", clientRoadmapGroupsError.message);
  return (data ?? []) as unknown as RoadmapGroup[];
}

// The next few items on the roadmap for the home page: highest effective
// priority first (client choice wins over Edge8's), parked items excluded.
// Returns the top `limit` plus the total active count for "view all".
export async function getBacklogForActor(actor: PortalActor): Promise<BacklogItem[]> {
  if (actor.companyScope.length === 0) return [];
  const { data, error: clientBacklogItemsError2 } = await portalRead(actor, "client_backlog_items", BACKLOG_SELECT)
    .is("archived_at", null);
  if (clientBacklogItemsError2) console.error("[portal] client_backlog_items read failed:", clientBacklogItemsError2.message);
  const items = (data ?? []) as unknown as BacklogItem[];
  // Effective order within a group is the client's dragged order when set,
  // else Edge8's sort_order. Sort here since PostgREST can't coalesce in order.
  return items.sort(
    (a, b) => (a.client_sort_order ?? a.sort_order) - (b.client_sort_order ?? b.sort_order),
  );
}

// Persist the client's dragged order for one group: writes client_sort_order to
// every item id in the given order. Every id is re-checked against the actor's
// scope AND confirmed to sit in that group before any write (IDOR guard).
export async function reorderGroupForActor(
  actor: PortalActor,
  groupKey: string,
  orderedIds: string[],
): Promise<Result> {
  if (actor.companyScope.length === 0) return { ok: false, error: "No company in scope." };
  if (orderedIds.length === 0) return { ok: true };

  // Load the group's items in scope; the set must match the ids we were given.
  const { data, error: clientBacklogItemsError3 } = await portalRead(actor, "client_backlog_items", "id, group_key, company_id")
    .eq("group_key", groupKey)
    .is("archived_at", null);
  if (clientBacklogItemsError3) console.error("[portal] client_backlog_items read failed:", clientBacklogItemsError3.message);
  const rows = (data ?? []) as unknown as Array<{ id: string; company_id: string }>;
  const scoped = new Set(rows.map((r) => r.id));
  if (orderedIds.length !== scoped.size || !orderedIds.every((id) => scoped.has(id))) {
    return { ok: false, error: "Item set does not match this group." };
  }
  // Reordering is an admin power, checked per owning company.
  for (const companyId of new Set(rows.map((r) => r.company_id))) {
    if (!isPortalAdmin(actor, companyId)) return { ok: false, error: ROLE_DENIED };
  }

  const now = new Date().toISOString();
  const results = await Promise.all(
    orderedIds.map((id, i) =>
      updateClientBacklogItems({ client_sort_order: i * 10, updated_at: now })
        .eq("id", id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false, error: failed.error.message };
  return { ok: true };
}

// The client sets (or clears) their own priority on one item. Ownership is
// re-checked against the actor's company scope before writing.
export async function setClientPriorityForActor(
  actor: PortalActor,
  itemId: string,
  priority: string | null,
): Promise<Result> {
  if (priority !== null && !isBacklogPriority(priority)) {
    return { ok: false, error: "Invalid priority." };
  }
  const owner = await assertInScope(actor, "client_backlog_items", itemId);
  if (!owner) return { ok: false, error: "Item not found." };
  if (!isPortalAdmin(actor, owner)) return { ok: false, error: ROLE_DENIED };

  const { error } = await updateClientBacklogItems({ client_priority: priority, updated_at: new Date().toISOString() })
    .eq("id", itemId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// The client proposes a new item. Lands as source='client', status='proposed'
// in the group they picked, defaulting to their chosen priority. company_id is
// resolved from the actor's scope, never trusted from the client.
export async function proposeItemForActor(
  actor: PortalActor,
  input: { companyId: string; groupKey: string; title: string; note?: string; priority?: string; aiProgramId?: string | null },
): Promise<Result & { id?: string }> {
  if (!actor.companyScope.includes(input.companyId)) {
    return { ok: false, error: "Not your company." };
  }
  if (!canContribute(actor, input.companyId)) return { ok: false, error: ROLE_DENIED };
  const title = input.title?.trim();
  if (!title) return { ok: false, error: "A short title is required." };
  // Proposals made inside a program view carry its tag, so they land in that
  // program's roadmap. The program must be the company's own (IDOR guard).
  const aiProgramId = input.aiProgramId ?? null;
  if (aiProgramId) {
    // Was: log the error, then report "no longer exists" — so a database hiccup
    // told the person their programme had been deleted (A.12/A.14).
    const programAnswer = await programInCompany(aiProgramId, input.companyId);
    if (!programAnswer.ok) return { ok: false, error: programAnswer.error };
    if (!programAnswer.program) return { ok: false, error: "That AI Program no longer exists." };
  }
  // The group must be one of this company's own active sections.
  const { data: groupRow, error: groupRowError } = await selectClientRoadmapGroups("id")
    .eq("company_id", input.companyId)
    .eq("key", input.groupKey)
    .is("archived_at", null)
    .maybeSingle();
  // Same guard, same rule: a failed read must not be reported as a missing
  // section. The program half of this check was fixed and this one was not.
  if (groupRowError) return { ok: false, error: groupRowError.message };
  if (!groupRow) return { ok: false, error: "That roadmap section no longer exists." };
  const priority = isBacklogPriority(input.priority) ? input.priority : "next";

  const { data, error } = await insertClientBacklogItems({
      company_id: input.companyId,
      ai_program_id: aiProgramId,
      group_key: input.groupKey,
      title,
      client_note: input.note?.trim() || null,
      edge8_priority: priority,
      client_priority: priority,
      source: "client",
      status: "proposed",
      sort_order: 999,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}

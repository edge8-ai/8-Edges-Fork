// The questions other entities ask of a client's roadmap items
// (client_backlog_items), and the writes the portal and the team hub make to
// them (A.66). Until A.66 the door handed out `selectClientBacklogItems` and
// the `BACKLOG_SELECT` column list, so boards, crm, portal and team each
// assembled their own reads and spelled "live" (`archived_at is null`) for
// themselves. The client portal and the team's client hub render these rows,
// so every question takes the company ids the caller has already scoped and
// never widens them: a caller asking about one company gets `eq`, a caller
// asking about a set gets `in`, exactly as each used to.
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert, TablesUpdate } from "@/kernel/data/supabase/database.types";
import { BACKLOG_SELECT as ITEM, type BacklogItem, type BacklogPriority } from "./client-backlog";

const ASCENDING = { ascending: true } as const;

// The generated types read the priority, status and source columns as plain
// text; the check constraints narrow them to BacklogItem's unions, stated once
// here rather than by every reader.
const asItems = (data: unknown) => data as BacklogItem[] | null;

/** The item's id, only when it is on this company's roadmap: a card may link to it. */
export async function backlogItemInCompany(itemId: string, companyId: string) {
  return companyOs.from("client_backlog_items").select("id").eq("id", itemId).eq("company_id", companyId).maybeSingle();
}

/** The item's company, or null when there is no such item; the caller checks it against its own scope. */
export async function backlogItemCompany(itemId: string) {
  return companyOs.from("client_backlog_items").select("id, company_id").eq("id", itemId).maybeSingle();
}

/** The titles of these items, archived ones included: the labels on linked cards. */
export async function backlogItemTitles(itemIds: string[]) {
  return companyOs.from("client_backlog_items").select("id, title").in("id", itemIds);
}

/** A company's live items as a card's roadmap picker lists them, in Edge8's order. */
export async function liveBacklogItemRefs(companyId: string) {
  return companyOs
    .from("client_backlog_items")
    .select("id, title, group_key")
    .eq("company_id", companyId)
    .is("archived_at", null)
    .order("sort_order");
}

/**
 * The items of these companies that are live, or that changed on or after the
 * day `sinceIso` falls on. Archived items matter only when they moved inside
 * the window. The filter takes the window's first day, a superset of the
 * window, because a bare date needs no quoting inside an or-group; the caller
 * applies the exact instant.
 */
export async function backlogActivitySince(companyIds: string[], sinceIso: string) {
  return companyOs
    .from("client_backlog_items")
    .select("company_id, updated_at, archived_at")
    .in("company_id", companyIds)
    .or(`archived_at.is.null,updated_at.gte.${sinceIso.slice(0, 10)}`);
}

/** A company's live roadmap items, unordered. */
export async function roadmapItemsOfCompany(companyId: string) {
  const { data, error } = await companyOs.from("client_backlog_items").select(ITEM).eq("company_id", companyId).is("archived_at", null);
  return { data: asItems(data), error };
}

/**
 * The live roadmap items of these companies, unordered. The ids must come from
 * the caller's own scope: the portal passes the actor's companyScope, the team
 * hub the member's active assignments.
 */
export async function roadmapItemsOfCompanies(companyIds: string[]) {
  const { data, error } = await companyOs.from("client_backlog_items").select(ITEM).in("company_id", companyIds).is("archived_at", null);
  return { data: asItems(data), error };
}

/** One page (rows from..to) of a company's live roadmap items in Edge8's order, id breaking ties so pages are stable. */
export async function roadmapItemsPage(companyId: string, from: number, to: number) {
  const { data, error } = await companyOs
    .from("client_backlog_items")
    .select(ITEM)
    .eq("company_id", companyId)
    .is("archived_at", null)
    .order("sort_order", ASCENDING)
    .order("id")
    .range(from, to);
  return { data: asItems(data), error };
}

/** One programme's live roadmap items, in Edge8's order. */
export async function programRoadmapItems(companyId: string, programId: string) {
  const { data, error } = await companyOs
    .from("client_backlog_items")
    .select(ITEM)
    .eq("company_id", companyId)
    .eq("ai_program_id", programId)
    .is("archived_at", null)
    .order("sort_order", ASCENDING);
  return { data: asItems(data), error };
}

/** The upper token estimate of every live item of these companies: the planned tokens. */
export async function plannedTokensOfCompanies(companyIds: string[]) {
  return companyOs.from("client_backlog_items").select("token_high").in("company_id", companyIds).is("archived_at", null);
}

/**
 * One page (rows from..to, by id) of a company's live items, as the hub's
 * figures count them: which programme each sits under, its status and its
 * upper token estimate. Paged because a busy roadmap outgrows PostgREST's
 * 1000-row cap, and a truncated read would undercount.
 */
export async function liveBacklogFactsPage(companyId: string, from: number, to: number) {
  return companyOs
    .from("client_backlog_items")
    .select("ai_program_id, status, token_high")
    .eq("company_id", companyId)
    .is("archived_at", null)
    .order("id")
    .range(from, to);
}

/** What a new roadmap item may carry. Any column left out takes the table default. */
export type RoadmapItemDraft = Pick<
  TablesInsert<{ schema: "company_os" }, "client_backlog_items">,
  | "company_id"
  | "ai_program_id"
  | "group_key"
  | "title"
  | "who"
  | "today_state"
  | "build_desc"
  | "client_note"
  | "edge8_priority"
  | "client_priority"
  | "source"
  | "status"
  | "sort_order"
>;

/** Add an item to a roadmap and return its id. The caller has checked the company, the group and the programme. */
export async function addRoadmapItem(draft: RoadmapItemDraft) {
  return companyOs.from("client_backlog_items").insert(draft).select("id").single();
}

/** The fields the team hub may edit on an item, and the time of the edit. */
export type RoadmapItemPatch = Pick<
  TablesUpdate<{ schema: "company_os" }, "client_backlog_items">,
  "title" | "group_key" | "who" | "today_state" | "build_desc" | "status" | "updated_at"
>;

/** Apply the team hub's edit to one item. */
export async function editRoadmapItem(itemId: string, patch: RoadmapItemPatch) {
  return companyOs.from("client_backlog_items").update(patch).eq("id", itemId);
}

/** Record the client's own order for one item (its place in the client's dragged list). */
export async function setClientSortOrder(itemId: string, clientSortOrder: number, updatedAt: string) {
  return companyOs.from("client_backlog_items").update({ client_sort_order: clientSortOrder, updated_at: updatedAt }).eq("id", itemId);
}

/** Record (or clear) the client's own priority for one item. */
export async function setClientPriority(itemId: string, priority: BacklogPriority | null, updatedAt: string) {
  return companyOs.from("client_backlog_items").update({ client_priority: priority, updated_at: updatedAt }).eq("id", itemId);
}

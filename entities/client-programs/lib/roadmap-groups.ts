// The questions other entities ask of a client's roadmap sections
// (client_roadmap_groups) and of its written overview
// (client_roadmap_overview), A.66. Until A.66 the door handed out the table
// helpers and the `ROADMAP_GROUPS_SELECT` column list, and boards, crm, portal
// and team each spelled "live" (`archived_at is null`) and the display order
// for themselves. As with the items, every question takes ids the caller has
// already scoped, and keeps `eq` for one company and `in` for a set.
import { companyOs } from "@/kernel/data/supabase";
import { ROADMAP_GROUPS_SELECT as GROUP, type RoadmapGroup } from "./client-backlog";

const ASCENDING = { ascending: true } as const;
const asGroups = (data: unknown) => data as RoadmapGroup[] | null;

/** A company's live roadmap sections, in display order. */
export async function roadmapGroupsOfCompany(companyId: string) {
  const { data, error } = await companyOs
    .from("client_roadmap_groups")
    .select(GROUP)
    .eq("company_id", companyId)
    .is("archived_at", null)
    .order("sort_order", ASCENDING);
  return { data: asGroups(data), error };
}

/** The live roadmap sections of these companies, in display order. The ids must come from the caller's own scope. */
export async function roadmapGroupsOfCompanies(companyIds: string[]) {
  const { data, error } = await companyOs
    .from("client_roadmap_groups")
    .select(GROUP)
    .in("company_id", companyIds)
    .is("archived_at", null)
    .order("sort_order", ASCENDING);
  return { data: asGroups(data), error };
}

/** Where each live section of these companies sits, unordered: enough to rank items by their section. */
export async function roadmapGroupRanks(companyIds: string[]) {
  return companyOs.from("client_roadmap_groups").select("company_id, key, sort_order").in("company_id", companyIds).is("archived_at", null);
}

/** The company's live section with this key, or null: an item may only be filed under one. */
export async function liveRoadmapGroup(companyId: string, key: string) {
  return companyOs
    .from("client_roadmap_groups")
    .select("id")
    .eq("company_id", companyId)
    .eq("key", key)
    .is("archived_at", null)
    .maybeSingle();
}

/** The roadmap overview Edge8 wrote for a company, or null when none has been written. */
export async function roadmapOverview(companyId: string) {
  return companyOs.from("client_roadmap_overview").select("body").eq("company_id", companyId).maybeSingle();
}

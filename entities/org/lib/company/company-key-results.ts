import { companyOs } from "@/kernel/data/supabase";
import { readOr } from "@/kernel/data/read";

// The company KPIs other screens can link to: the key results under this
// year's company-level objectives. Goals are set per year and reviewed
// quarterly, so the year is the cycle (see office-goals.ts).

type CompanyKeyResultOption = { id: string; title: string; objectiveTitle: string };

export async function listCompanyKeyResults(): Promise<CompanyKeyResultOption[]> {
  const res = await companyOs
    .from("key_results")
    .select("id, title, sort_order, objectives!inner(title, level, year, status, sort_order)")
    .eq("objectives.level", "company")
    .eq("objectives.year", new Date().getFullYear())
    .neq("objectives.status", "dropped");
  // A failed read leaves the picker empty; the campaign's own goal text still
  // saves, so an empty list is an acceptable fallback here.
  const rows = readOr(res, "company key results", []) as {
    id: string;
    title: string;
    sort_order: number;
    objectives: { title: string; sort_order: number } | { title: string; sort_order: number }[];
  }[];
  return rows
    .map((r) => {
      const o = Array.isArray(r.objectives) ? r.objectives[0] : r.objectives;
      return { id: r.id, title: r.title, objectiveTitle: o?.title ?? "", objSort: o?.sort_order ?? 0, krSort: r.sort_order };
    })
    .sort((a, b) => a.objSort - b.objSort || a.krSort - b.krSort)
    .map(({ id, title, objectiveTitle }) => ({ id, title, objectiveTitle }));
}

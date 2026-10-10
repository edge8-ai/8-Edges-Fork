import { selectCompanies } from "@/kernel/identity/reads";
import { selectIdeaTrendReports } from "@/entities/ideas";
import { collectErrors, countBy, type BucketCount, type Loaded } from "./shared";

// The Market tab's figures (RH-3): who the company base is (lifecycle,
// industry, country, size) and what the weekly trend report is saying.
// Companies are a kernel table, readable by every entity; the trend reports
// come through the ideas door.

export type MarketCompany = { id: string; name?: string | null; lifecycle_stage: string | null; industry_normalized: string | null; country: string | null; size_band: string | null; archived_at: string | null };
export type TrendReport = { themes: string[] | null; source_count: number | null; generated_at: string | null };
export type DuplicateGroup = { name: string; ids: string[] };

export type MarketMetrics = Loaded & {
  companies: number;
  byLifecycle: BucketCount[];
  byIndustry: BucketCount[];
  byCountry: BucketCount[];
  bySize: BucketCount[];
  trend: { themes: string[]; sourceCount: number; generatedAt: string | null } | null;
  trendHistory: number;
  duplicates: DuplicateGroup[];
};

// Two companies are probable duplicates when their names match once case,
// punctuation and the usual suffixes (Ltd, Inc, Pty, LLC, Co) are dropped.
export function normalizeCompanyName(name: string | null | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(pty|ltd|limited|inc|incorporated|llc|co|corp|corporation|company|group|holdings|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findDuplicateCompanies(companies: MarketCompany[]): DuplicateGroup[] {
  const groups = new Map<string, string[]>();
  for (const c of companies) {
    const key = normalizeCompanyName(c.name);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), c.id]);
  }
  return [...groups.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([name, ids]) => ({ name, ids }))
    .sort((a, b) => b.ids.length - a.ids.length || a.name.localeCompare(b.name));
}

export function aggregateMarket(companies: MarketCompany[], reports: TrendReport[], errors: string[] = []): MarketMetrics {
  const live = companies.filter((c) => !c.archived_at);
  const latest = [...reports].sort((a, b) => (b.generated_at ?? "").localeCompare(a.generated_at ?? ""))[0];
  return {
    errors,
    companies: live.length,
    byLifecycle: countBy(live, (c) => c.lifecycle_stage || "none"),
    byIndustry: countBy(live, (c) => c.industry_normalized || "unknown", 8),
    byCountry: countBy(live, (c) => c.country || "unknown", 8),
    bySize: countBy(live, (c) => c.size_band || "unknown"),
    trend: latest ? { themes: latest.themes ?? [], sourceCount: latest.source_count ?? 0, generatedAt: latest.generated_at } : null,
    trendHistory: reports.length,
    duplicates: findDuplicateCompanies(live),
  };
}

export async function loadMarket(): Promise<MarketMetrics> {
  const [coRes, trendRes] = await Promise.all([
    selectCompanies("id, name, lifecycle_stage, industry_normalized, country, size_band, archived_at").limit(5000),
    selectIdeaTrendReports("themes, source_count, generated_at").order("generated_at", { ascending: false }).limit(12),
  ]);
  const errors = collectErrors({ error: coRes.error, label: "companies" }, { error: trendRes.error, label: "trend reports" });
  return aggregateMarket((coRes.data ?? []) as MarketCompany[], (trendRes.data ?? []) as TrendReport[], errors);
}

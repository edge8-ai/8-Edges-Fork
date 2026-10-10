import { companyOs } from "@/kernel/data/supabase";
import { INDUSTRY_CATEGORIES, SIZE_BANDS } from "@/entities/crm/lib/company-enums";
import { clientStatus } from "@/kernel/identity/client-status";
import { saigonToday } from "@/kernel/config/dates";

// Whole-database aggregates for the Companies insight cards. Two narrow
// selects aggregated in JS — at this table size (~130 rows) that beats the
// grants/migration surface of an RPC. If companies ever outgrow the limit,
// swap the internals for an RPC; the call site stays the same.

const ROW_LIMIT = 5000;

export type CompaniesSummary = {
  total: number;
  sizeBands: Array<{ label: string; value: number }>;
  industries: Array<{ label: string; value: number }>;
  countries: Array<{ label: string; value: number }>;
  withActiveDeals: number;
  clients: number;
};

export async function getCompaniesSummary(): Promise<CompaniesSummary | null> {
  const [companiesRes, dealsRes] = await Promise.all([
    companyOs
      .from("companies")
      .select("id, industry_normalized, size_band, client_start_date, client_end_date, country")
      .is("archived_at", null)
      .limit(ROW_LIMIT),
    companyOs.from("deals").select("company_id")
      .eq("status", "open")
      .is("archived_at", null)
      .not("company_id", "is", null)
      .limit(ROW_LIMIT),
  ]);
  if (companiesRes.error || !companiesRes.data) return null;

  const rows = companiesRes.data as Array<{
    id: string;
    industry_normalized: string | null;
    size_band: string | null;
    client_start_date: string | null;
    client_end_date: string | null;
    country: string | null;
  }>;

  const today = saigonToday();
  const sizeCounts = new Map<string, number>(SIZE_BANDS.map((b) => [b, 0]));
  const industryCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();
  let clients = 0;
  for (const r of rows) {
    if (r.size_band && sizeCounts.has(r.size_band)) {
      sizeCounts.set(r.size_band, (sizeCounts.get(r.size_band) ?? 0) + 1);
    }
    const cat = r.industry_normalized ?? "Uncategorized";
    industryCounts.set(cat, (industryCounts.get(cat) ?? 0) + 1);
    const country = r.country?.trim() || "Unknown";
    countryCounts.set(country, (countryCounts.get(country) ?? 0) + 1);
    if (clientStatus(r, today) === "current") clients++;
  }

  const activeIds = new Set(rows.map((r) => r.id));
  const withActiveDeals = new Set(
    ((dealsRes.data ?? []) as Array<{ company_id: string }>)
      .map((d) => d.company_id)
      .filter((id) => activeIds.has(id)),
  ).size;

  // Categories in taxonomy order for a stable chart; Uncategorized last.
  const industries = [...INDUSTRY_CATEGORIES.map((c) => ({ label: c as string, value: industryCounts.get(c) ?? 0 })), { label: "Uncategorized", value: industryCounts.get("Uncategorized") ?? 0 }].filter((d) => d.value > 0);

  // Countries by count desc; "Unknown" pinned last (the donut mutes + tails it).
  const countries = [...countryCounts.entries()]
    .filter(([label]) => label !== "Unknown")
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));
  const unknownCountry = countryCounts.get("Unknown") ?? 0;
  if (unknownCountry > 0) countries.push({ label: "Unknown", value: unknownCountry });

  return {
    total: rows.length,
    sizeBands: SIZE_BANDS.map((b) => ({ label: b, value: sizeCounts.get(b) ?? 0 })),
    industries,
    countries,
    withActiveDeals,
    clients,
  };
}

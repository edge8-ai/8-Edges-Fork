import { companyOs } from "@/kernel/data/supabase";
import { humanize } from "@/kernel/ui/format";

// Whole-database aggregates for the Contacts insight cards. One narrow select
// aggregated in JS — at this table size (~600 rows) that beats the grants
// surface of an RPC. Mirrors lib/admin/company-summary.ts.

const ROW_LIMIT = 5000;

// Persona order for a stable donut; "Unset" (null persona) renders muted last.
const PERSONA_ORDER = ["job_seeker", "prospect", "client", "employee"] as const;

// Messy free-text source collapsed into a handful of channels.
function sourceBucket(raw: string | null): string {
  const s = (raw ?? "").toLowerCase();
  if (!s) return "Other";
  if (s.includes("import") || s === "thoughtflow_crm") return "Import";
  if (s === "linkedin" || s === "itviec") return "LinkedIn / job boards";
  if (s === "referral") return "Referral";
  if (
    s === "inbound" ||
    s === "aio-pad" ||
    s.includes("edge8.ai") ||
    s.includes("ai-officer") ||
    s.includes("infiniteleverage")
  )
    return "Inbound (web)";
  return "Other";
}

export type ContactsSummary = {
  total: number;
  prospects: number;
  clients: number;
  personas: Array<{ label: string; value: number }>;
  sources: Array<{ label: string; value: number }>;
  countries: Array<{ label: string; value: number }>;
};

export async function getContactsSummary(): Promise<ContactsSummary | null> {
  const res = await companyOs
    .from("people")
    .select("persona, source, country")
    .is("archived_at", null)
    .limit(ROW_LIMIT);
  if (res.error || !res.data) return null;

  const rows = res.data as Array<{ persona: string | null; source: string | null; country: string | null }>;

  const personaCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();
  for (const r of rows) {
    const persona = r.persona?.trim() || "__unset__";
    personaCounts.set(persona, (personaCounts.get(persona) ?? 0) + 1);
    const bucket = sourceBucket(r.source);
    sourceCounts.set(bucket, (sourceCounts.get(bucket) ?? 0) + 1);
    const country = r.country?.trim() || "Unknown";
    countryCounts.set(country, (countryCounts.get(country) ?? 0) + 1);
  }

  // Personas in fixed order, then "Unset" (neutral, pinned last by the donut).
  const personas = [
    ...PERSONA_ORDER.map((p) => ({ label: humanize(p), value: personaCounts.get(p) ?? 0 })),
    { label: "Unset", value: personaCounts.get("__unset__") ?? 0 },
  ].filter((d) => d.value > 0);

  const sources = [...sourceCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));

  // Countries by count desc; "Unknown" pinned last (the donut mutes + tails it).
  const countries = [...countryCounts.entries()]
    .filter(([label]) => label !== "Unknown")
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));
  const unknown = countryCounts.get("Unknown") ?? 0;
  if (unknown > 0) countries.push({ label: "Unknown", value: unknown });

  return {
    total: rows.length,
    prospects: personaCounts.get("prospect") ?? 0,
    clients: personaCounts.get("client") ?? 0,
    personas,
    sources,
    countries,
  };
}

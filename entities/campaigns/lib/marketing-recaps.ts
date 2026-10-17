import { companyOs } from "@/kernel/data/supabase";

// Read side for the monthly marketing recaps the marketing-recap cron writes.
// The Content recommendations page renders these newest-first.

export type RecapSuggestion = { title: string; rationale: string };
export type RecapMetrics = {
  broadcasts: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
};
export type MarketingRecapRow = {
  id: string;
  periodMonth: string;
  readout: string;
  suggestions: RecapSuggestion[];
  metrics: RecapMetrics;
  model: string | null;
  generatedAt: string;
};

const EMPTY_METRICS: RecapMetrics = { broadcasts: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, unsubscribed: 0 };

function asSuggestions(value: unknown): RecapSuggestion[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (s): s is RecapSuggestion =>
      !!s && typeof s === "object" && typeof (s as RecapSuggestion).title === "string" && typeof (s as RecapSuggestion).rationale === "string",
  );
}

function asMetrics(value: unknown): RecapMetrics {
  if (!value || typeof value !== "object") return EMPTY_METRICS;
  const v = value as Record<string, unknown>;
  const num = (k: string) => (typeof v[k] === "number" ? (v[k] as number) : 0);
  return {
    broadcasts: num("broadcasts"),
    sent: num("sent"),
    delivered: num("delivered"),
    opened: num("opened"),
    clicked: num("clicked"),
    unsubscribed: num("unsubscribed"),
  };
}

export async function listMarketingRecaps(): Promise<{ rows: MarketingRecapRow[]; error?: string }> {
  const { data, error } = await companyOs.from("marketing_recaps").select("id, period_month, readout, suggestions, metrics, model, generated_at")
    .order("period_month", { ascending: false });
  if (error) return { rows: [], error: error.message };

  type Db = {
    id: string;
    period_month: string;
    readout: string;
    suggestions: unknown;
    metrics: unknown;
    model: string | null;
    generated_at: string;
  };
  const rows = ((data ?? []) as Db[]).map((r) => ({
    id: r.id,
    periodMonth: r.period_month,
    readout: r.readout,
    suggestions: asSuggestions(r.suggestions),
    metrics: asMetrics(r.metrics),
    model: r.model,
    generatedAt: r.generated_at,
  }));
  return { rows };
}

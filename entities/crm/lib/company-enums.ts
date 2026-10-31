// Single source of truth for the companies enrichment vocabularies.
// Must stay in sync with the CHECK constraints in
// supabase/migrations/20260709090000_companies_enrichment.sql.

export const INDUSTRY_CATEGORIES = [
  "Technology & Software",
  "Food & Beverage",
  "Hospitality & Travel",
  "Financial Services",
  "Professional Services",
  "Real Estate & Construction",
  "Retail & Consumer Goods",
  "Manufacturing",
  "Healthcare & Wellness",
  "Legal",
  "Marketing & Media",
  "Education",
  "Logistics & Supply Chain",
  "Energy",
  "Other",
] as const;

export const SIZE_BANDS = ["0-50", "51-250", "251-5000", "5000+"] as const;

// Deal/company priority. Matches the values used across the Revenue office
// (companies list FilterBar, deals) — stored lowercase.
export const PRIORITY_LEVELS = ["high", "medium", "low"] as const;

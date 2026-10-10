// Shared, client-safe constants for the interview panel (rounds + scorecards).
// No server imports here so both the client component and the server actions
// can read the same vocabulary. Server-only helpers (ensureAiPanelist, DB
// access) live in the applications interview-actions module.

// The scorecard recommendation. The UI speaks advance / hold / reject (the
// scale Dave approved); the interview_scorecards.recommendation CHECK
// constraint predates this and stores a 5-point strong_yes…strong_no scale, so
// we map onto three of those five values and leave strong_yes / strong_no
// unused. Changing the constraint is deferred — this keeps PR 1 schema-free.
export const RECOMMENDATIONS = [
  { key: "advance", label: "Advance", db: "yes", tone: "ok" },
  { key: "hold", label: "Hold", db: "neutral", tone: "warn" },
  { key: "reject", label: "Reject", db: "no", tone: "err" },
] as const;

export type RecommendationKey = (typeof RECOMMENDATIONS)[number]["key"];

const DB_BY_KEY = new Map<string, string>(RECOMMENDATIONS.map((r) => [r.key, r.db]));
const KEY_BY_DB = new Map<string, string>(RECOMMENDATIONS.map((r) => [r.db, r.key]));

export function recommendationToDb(key: RecommendationKey): string {
  return DB_BY_KEY.get(key) ?? "neutral";
}

// Map a stored recommendation back to a UI key. strong_yes / strong_no (never
// written by this UI, but possible from other sources) fold to advance / reject.
export function recommendationFromDb(db: string | null): RecommendationKey | null {
  if (!db) return null;
  if (db === "strong_yes") return "advance";
  if (db === "strong_no") return "reject";
  return (KEY_BY_DB.get(db) as RecommendationKey | undefined) ?? null;
}

// interviews.mode CHECK constraint values, with human labels.
export const ROUND_MODES = [
  { value: "video", label: "Video" },
  { value: "phone", label: "Phone" },
  { value: "onsite", label: "Onsite" },
  { value: "panel", label: "Panel" },
  { value: "take_home", label: "Take-home" },
] as const;

// Default scorecard criteria for a human panelist in PR 1. Per-role rubrics
// (PR 3) will supersede this; until then every round scores the same four.
export const DEFAULT_CRITERIA = ["Technical depth", "Communication", "Ownership", "Values fit"] as const;

// The AI panelist is a real people row so it can hold interviewer + scorecard
// rows like any human. It is identified by this sentinel email and metadata.is_ai.
export const AI_PANELIST_EMAIL = "ai-panelist@edge8.local";
export const AI_PANELIST_NAME = "Edge8 AI Panelist";

// The single source of truth for "is this person the AI panelist". Kept here
// (client-safe, alongside the sentinel it checks) so admin and team share one
// rule instead of each re-implementing it.
export function isAiPanelist(p: { email?: string | null; metadata?: unknown } | null): boolean {
  if (!p) return false;
  if (p.email === AI_PANELIST_EMAIL) return true;
  const meta = p.metadata as { is_ai?: boolean } | null;
  return Boolean(meta && meta.is_ai);
}

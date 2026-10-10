// The Supabase tables the ideas entity owns (design §4).
export const IDEAS_TABLES = [
  "idea_builds",
  "idea_reactions",
  "idea_trend_reports",
  "ideas",
  "issues",
  "sync_packets",
] as const;

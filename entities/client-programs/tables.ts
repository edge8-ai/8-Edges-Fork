// The Supabase tables the client-programs entity owns (design §4; moved off
// portal by RS-02 so the entities that read a programme all sit above it;
// program_documents followed with RS-04, because the documents hang off a
// programme and the store that writes them moved here with the screens).
export const CLIENT_PROGRAMS_TABLES = [
  "ai_programs",
  "client_backlog_items",
  "client_roadmap_groups",
  "client_roadmap_overview",
  "client_status_reports",
  "program_documents",
] as const;

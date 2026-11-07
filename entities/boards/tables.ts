// The Supabase tables the boards entity owns (design §4; moved off company-os
// by RS-01 along with the module that writes them).
//
// Ownership means boards is the only entity that writes these directly;
// everyone else goes through this entity's index.ts. The gate that enforces it
// (scripts/check-table-ownership.mjs) reads the same list from the `tables`
// array on `boards` in entities.manifest.json, because the gate runs on a fresh
// checkout with no TypeScript toolchain. This file is the in-code half of that
// declaration, and tables.test.ts fails if the two ever disagree.
export const BOARDS_TABLES = [
  "board_columns",
  "board_members",
  "boards",
  "epics",
  "sprints",
  "task_attachments",
  "task_comments",
  "task_stage_log",
  "tasks",
] as const;

// The Supabase tables the assistant entity owns (design §4).
//
// One table: assistant_conversations, the shared chat history behind both the
// admin and the team assistant. Ownership means the assistant is the only entity
// that writes it directly, which is already true — every read and write goes
// through lib/history/store.ts, scoped to (surface, owner_auth_user_id).
//
// The gate that enforces this (scripts/check-table-ownership.mjs) reads the same
// list from the `tables` array on `assistant` in entities.manifest.json, because
// it runs on a fresh checkout with no TypeScript toolchain. This file is the
// in-code half of that declaration, and assistant-entity.test.ts fails if the two
// ever disagree.
export const ASSISTANT_TABLES = ["assistant_conversations"] as const;

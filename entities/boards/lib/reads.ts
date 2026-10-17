// The reads other entities may make of boards' tables, for the cases where the
// caller owns the question but not the data — the team hub's own board views and
// the client board in the portal. Same shape as writes.ts: the helper names the
// table and returns the PostgREST builder, so the caller keeps its own columns
// and filters and the table-ownership gate sees the read attributed to the owner
// rather than as a raw cross-entity `.from(...)`.
//
// Keep this list short. A caller that needs more than columns and filters wants
// a domain function in this entity — `getWorkboard` is the example.
import { companyOs } from "@/kernel/data/supabase";

// PostgREST infers a row shape from a *literal* column list. These helpers take
// a plain `string` so the caller keeps its own columns, which erases that
// inference, and a generic column parameter sends tsc into a combinatorial
// blow-up over PostgREST's conditional types. Naming the result as an open
// record instead keeps every caller's existing `as SomeRow[]` cast working.
type Row = Record<string, unknown>;

export const selectBoards = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("boards").select<string, Row>(columns, options);
export const selectBoardColumns = (columns: string) => companyOs.from("board_columns").select<string, Row>(columns);
export const selectBoardMembers = (columns: string) => companyOs.from("board_members").select<string, Row>(columns);
export const selectTasks = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("tasks").select<string, Row>(columns, options);

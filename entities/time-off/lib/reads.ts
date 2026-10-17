// The reads other entities may make of time-off's tables. Same shape as
// writes.ts: the helper names the table and returns the PostgREST builder, so
// the caller keeps its own columns, filters and error handling and the
// table-ownership gate sees the read attributed to the owner rather than as a
// raw cross-entity `.from(...)`.
//
// The callers are the portal (a client manager decides their placed staff's
// leave requests) and company-os's cockpit, dashboard and team-member screens
// (who is out, how many requests wait, one member's leave history): each is that
// entity's question about time-off rows. Keep this list short — a caller that
// needs more than columns and filters wants a domain function in this entity.
import { companyOs } from "@/kernel/data/supabase";

// PostgREST infers a row shape from a *literal* column list. These helpers take
// a plain `string` so the caller keeps its own columns, which erases that
// inference, and a generic column parameter sends tsc into a combinatorial
// blow-up over PostgREST's conditional types. Naming the result as an open
// record instead keeps every caller's existing `as SomeRow[]` cast working.
type Row = Record<string, unknown>;

// The column list is a plain `string`, so PostgREST cannot infer the row shape
// and the caller states it — exactly as these call sites already did with their
// own `as` casts. Making it generic restores inference but sends tsc into a
// combinatorial blow-up over PostgREST's conditional types, so it stays wide.

export const selectTimeOff = (
  columns: string,
  options?: { head?: boolean; count?: "exact" | "planned" | "estimated" },
) => companyOs.from("time_off").select<string, Row>(columns, options);

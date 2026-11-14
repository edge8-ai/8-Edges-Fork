import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "./supabase/database.types";

// The jsonb value type, re-exported so a caller writing a jsonb column can name
// the shape the generated row type expects without reaching past this door.
export type { Json };

// Server-only Supabase client connected to the shared ai-officer database
// (shared with the brand's other sites).
// Uses the secret key, which bypasses RLS. NEVER import from a client component.

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  console.warn(
    "Supabase env vars not configured (SUPABASE_URL / SUPABASE_SECRET_KEY). Database features will not work."
  );
}

export const supabase = createClient<Database>(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseSecretKey || "placeholder-key",
  {
    auth: { persistSession: false },
  }
);

// Query builder scoped to the `company_os` schema — the canonical Company OS
// (people, inquiries, candidates, applications, documents, bookings, orders).
// Site forms write here via the service-role key (bypasses RLS). Storage stays
// on the base `supabase` client (buckets are schema-independent).
export const companyOs = supabase.schema("company_os");

// Query builder scoped to the `htt` schema (Human Token Tracker: repos,
// pull_requests, token_entries, man_hour_entries, token_allocations, ...).
// Same service-role discipline as companyOs: server-only, callers scope every
// read by the actor's companyScope.
export const htt = supabase.schema("htt");

// The same two query builders, with the schema types deliberately dropped.
//
// A handful of helpers take the table name as a runtime `string` — the generic
// admin list/count pair, the /team and /portal scope allowlists, the one-off
// importers. `from()` on a typed client cannot resolve a non-literal table, and
// a union over every table in the schema makes the checker give up
// ("excessively deep"), so those call sites use this view instead of losing the
// types everywhere else. Same client object underneath: `schema()` only
// re-wraps it, so there is no second connection and no behaviour change.
// The second reason a call site needs this: a table the generated types do not
// know about. `supabase/database.types.ts` currently carries no `public` tables
// at all, and is missing four company_os ones whose migrations have shipped
// (`metrics`, `requisition_loop_interviewers`, `brand_contacts`, and
// `private_session_blocks`, which lives in `public`). Regenerating is a
// separate change — CI's `types-fresh` job is where that belongs — so for now
// those reads are explicitly untyped rather than silently mistyped.
export const supabaseUntyped = supabase as unknown as SupabaseClient;
export const companyOsUntyped = supabaseUntyped.schema("company_os");

// Supabase's type generator renders a SQL argument declared `DEFAULT NULL` as
// optional but not nullable (`p_note?: string`), so a call that passes an
// explicit `null` — which PostgREST forwards, and the function accepts — fails
// to type-check even though it is exactly what the function was written for.
// Wrapping the argument object restores the nullability the generator dropped,
// while still checking the argument NAMES against the function's signature.
export function rpcArgs<T extends Record<string, unknown>>(
  args: T,
): { [K in keyof T]: Exclude<T[K], null> } {
  return args as { [K in keyof T]: Exclude<T[K], null> };
}

// Row/Insert/Update shapes for a `company_os` table, so an action's patch
// accumulator can name the table it writes instead of `Record<string, unknown>`
// — which, now that the clients are typed, would silently opt that write out of
// PostgREST's column checking.
export type CompanyOsUpdate<T extends keyof Database["company_os"]["Tables"]> =
  Database["company_os"]["Tables"][T]["Update"];
export type CompanyOsInsert<T extends keyof Database["company_os"]["Tables"]> =
  Database["company_os"]["Tables"][T]["Insert"];

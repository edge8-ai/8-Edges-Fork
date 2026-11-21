// The stored QuickBooks connections, one row per QuickBooks company keyed by
// its entity slug (A.65, ADR 0018). Company-os's QuickBooks client reads and
// rotates them; finance owns the rows, which hold live OAuth tokens, so no
// other caller has a reason to ask.
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert, TablesUpdate } from "@/kernel/data/supabase/database.types";
import type { Result } from "@/kernel/data/result";

type ConnectionInsert = TablesInsert<{ schema: "company_os" }, "qbo_connection">;
type ConnectionUpdate = TablesUpdate<{ schema: "company_os" }, "qbo_connection">;

/** One QuickBooks company's connection, tokens included, or null when it was never connected. */
export async function qboConnection(entity: string) {
  return companyOs.from("qbo_connection").select("*").eq("id", entity).maybeSingle();
}

/** Stores a connection made through the OAuth callback, replacing that company's row. */
export async function saveQboConnection(row: ConnectionInsert): Promise<Result> {
  const { error } = await companyOs.from("qbo_connection").upsert(row);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Stores a refreshed token set, but only while the stored refresh token is
 * still the one this refresh used. That condition is the serialization point
 * across concurrent lambdas: the rows answered are the ones it matched, and
 * none means someone else rotated first.
 */
export async function rotateQboTokens(entity: string, usedRefreshToken: string, tokens: ConnectionUpdate) {
  return companyOs.from("qbo_connection").update(tokens).eq("id", entity).eq("refresh_token", usedRefreshToken).select("id");
}

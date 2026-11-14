// The shared code each access-gate scope compares against, held in
// company_os.access_codes so an admin can change one and the next unlock
// sees it, with no env edit and no redeploy.
//
// The code is plain text on purpose: an admin reads it back to send to a
// client. It is a content code, not a credential (see access-gate.ts), and the
// table is service-role only. Nothing here logs a code or copies one into the
// audit trail, and nothing outside this module touches the table.
//
// The auth guard stays with the caller, as in writes.ts: an unlock action is
// public by design, and the settings screen guards with requireAdmin.
import { companyOs } from "@/kernel/data/supabase";
import { log } from "@/kernel/config/log";

export interface AccessCodeRow {
  scope: string;
  code: string;
  updated_at: string;
  updated_by: string | null;
}

export const ACCESS_CODE_MIN_LENGTH = 6;
export const ACCESS_CODE_MAX_LENGTH = 128;

// The code an unlock action compares against: the scope's row when one exists,
// else the env var the scope used before the table did, else null. Null means
// "not configured" and the caller must fail closed.
//
// A failed read also falls back to the env var rather than locking the page:
// this code ships before its migration is applied, and a missing table must
// not take down a gate that worked yesterday. The fallback can only ever admit
// the env code, which is a code Edge8 chose, so it never opens the gate wider
// than it already was.
export async function resolveAccessCode(scope: string, envFallback: string | undefined): Promise<string | null> {
  const { data, error } = await companyOs.from("access_codes").select("code").eq("scope", scope).maybeSingle();
  if (error) {
    log("error", "access_codes read failed; falling back to the env code", { scope, error: error.message });
    return envFallback || null;
  }
  return data?.code || envFallback || null;
}

export async function listAccessCodes(): Promise<{ ok: true; rows: AccessCodeRow[] } | { ok: false; error: string }> {
  const { data, error } = await companyOs.from("access_codes").select("scope, code, updated_at, updated_by").order("scope");
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: data ?? [] };
}

export async function setAccessCode(
  scope: string,
  code: string,
  updatedBy: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await companyOs
    .from("access_codes")
    .upsert({ scope, code, updated_at: new Date().toISOString(), updated_by: updatedBy }, { onConflict: "scope" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

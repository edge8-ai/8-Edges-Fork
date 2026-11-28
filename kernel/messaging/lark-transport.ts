// Talking to Lark as the Edge8 app: the tenant token, the request, and reading
// a body that may not be JSON. Split out of lark-api.ts when the calendar
// client arrived, because two clients needed the same three things and the
// alternative was exporting lark-api's internals to a sibling.
//
// FAIL-SOFT EVERYWHERE, and every client here depends on it: when
// LARK_APP_ID / LARK_APP_SECRET are unset, or a call fails, or a scope is
// missing, these return null and log. Nothing here throws.

const HOST = process.env.LARK_API_HOST || process.env.LARK_API_BASE || "https://open.larksuite.com";

export function larkConfigured(): boolean {
  return Boolean(process.env.LARK_APP_ID && process.env.LARK_APP_SECRET);
}

let cached: { token: string; expiresAt: number } | null = null;

/** Drop the cached tenant token. Exists for the tests. */
export function resetLarkToken(): void {
  cached = null;
}

async function tenantToken(): Promise<string | null> {
  if (!larkConfigured()) return null;
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token;
  try {
    const res = await fetch(`${HOST}/open-apis/auth/v3/tenant_access_token/internal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: process.env.LARK_APP_ID,
        app_secret: process.env.LARK_APP_SECRET,
      }),
      cache: "no-store",
    });
    const json = (await res.json()) as { code: number; tenant_access_token?: string; expire?: number; msg?: string };
    if (json.code !== 0 || !json.tenant_access_token) {
      console.error("[lark-api] tenant token failed:", json.code, json.msg);
      return null;
    }
    cached = { token: json.tenant_access_token, expiresAt: Date.now() + (json.expire ?? 3600) * 1000 };
    return cached.token;
  } catch (err) {
    console.error("[lark-api] tenant token error:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function larkFetch(path: string, init?: RequestInit): Promise<Response | null> {
  const token = await tenantToken();
  if (!token) return null;
  try {
    return await fetch(`${HOST}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch (err) {
    console.error(`[lark-api] ${path} error:`, err instanceof Error ? err.message : err);
    return null;
  }
}

// Lark's gateway answers a path it does not serve with a plain-text "404 page
// not found", and a proxy in front of it can answer with an HTML error page, so
// res.json() can throw. That throw escaped the fail-soft promise above and
// stopped the whole coaching cycle (2026-09-10 onward); a body that is not
// JSON now reads as null and the caller degrades like any other miss.
export async function readJson<T>(res: Response, path: string): Promise<T | null> {
  try {
    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      console.error(`[lark-api] ${path}: HTTP ${res.status}, body is not JSON: ${text.slice(0, 80)}`);
      return null;
    }
  } catch (err) {
    console.error(`[lark-api] ${path} read error:`, err instanceof Error ? err.message : err);
    return null;
  }
}

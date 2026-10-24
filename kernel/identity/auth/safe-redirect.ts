// Post-login redirect whitelist shared by the admin LoginForm (client) and the
// Supabase auth callback (server).
//
// `raw` is attacker-controllable — it rides in `?redirect=` on /admin/login and
// in `?next=` on the magic-link URL — so anything that is not a plain path onto
// one of our own /admin, /team or /portal surfaces falls back to `fallback`.
// Rejected: absolute URLs (`https://evil`, `javascript:`), protocol-relative
// `//evil`, backslashes (browsers normalise `/\evil` to `//evil`), and `..`
// path traversal.

const INTERNAL_SURFACE = /^\/(admin|team|portal)(\/|$)/;

export function safeInternalPath(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  if (raw.includes("\\") || raw.includes("..")) return fallback;
  if (!INTERNAL_SURFACE.test(raw)) return fallback;
  return raw;
}

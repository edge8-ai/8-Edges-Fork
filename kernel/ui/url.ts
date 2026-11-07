// Build a querystring for admin list pages, merging the current searchParams
// with overrides. Pass null/"" to drop a key. Used by sortable headers,
// pagination, and search to preserve unrelated filters.

export type SearchParamsObj = Record<string, string | string[] | undefined>;

export function mergeQuery(
  current: SearchParamsObj,
  overrides: Record<string, string | number | null | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    if (v === undefined) continue;
    params.set(k, Array.isArray(v) ? v[0] : v);
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null || v === undefined || v === "") params.delete(k);
    else params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// A link somebody typed, made safe to put in an href. A value with no scheme
// ("github.com/org/repo/pull/1") becomes https — as an href it would otherwise
// be a path inside this app — and anything that is not http(s) is refused,
// because React renders a stored `javascript:` href as written. Null means "do
// not draw this as a link".
const NON_WEB_SCHEME = /^(javascript|data|vbscript|mailto|tel|file|blob|about):/i;

export function externalHref(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (trimmed.length === 0 || trimmed.length > 2000) return null;
  // A prefix is a scheme only when "//" follows it or it is a known non-web
  // scheme. A bare `[a-z…]*:` test also matched "example.com:" in
  // "example.com:8080/x" and refused a host with a port; and without the
  // list, "mailto:a@b.co" would come out as https with "mailto" as a user.
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || NON_WEB_SCHEME.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

// A link field a person edits, read the way every writer should read it. Empty
// is a real answer (clear the field); a link is kept as externalHref writes it;
// anything else is refused. Returning null for the last case would write null,
// and a mistyped link would silently clear the one already saved.
export type LinkInput = { ok: true; value: string | null } | { ok: false };

export function parseLinkInput(raw: string | null | undefined): LinkInput {
  if (!raw?.trim()) return { ok: true, value: null };
  const href = externalHref(raw);
  return href ? { ok: true, value: href } : { ok: false };
}

// The refusal every LinkedIn writer returns (CRM, team roster, hiring, the
// client portal), kept in one place so the wording cannot drift between them.
export const LINKEDIN_NOT_A_LINK = "LinkedIn isn't a web link. Paste the profile address (e.g. linkedin.com/in/…).";

// A path on this site, safe to navigate to in place: one leading slash, never
// two ("//evil.com" is protocol-relative), no backslash (browsers read "/\evil"
// as "//evil") and no whitespace or control character (a tab or newline is
// stripped by the URL parser, so "/\t/evil.com" would also become "//evil.com").
// Null means "not a path on this site".
export function internalPath(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  if (trimmed.includes("\\") || /[\s\u0000-\u001f\u007f]/.test(trimmed)) return null;
  return trimmed;
}

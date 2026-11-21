// Generic, server-trusted access gate: an HMAC-signed cookie that says "this
// browser typed the correct shared code for scope X".
//
// It is NOT a login. It carries no identity and confers no data access — it
// unlocks internal *content* (the private workflows library, a client's scope
// document) that is otherwise readable by anyone who guesses a URL. The point
// is that the code itself never reaches the browser and the cookie cannot be
// forged, which is what the previous `edge8_private_ok=1` client cookie could
// not offer: the literal `1` was trivially settable and the code shipped in the
// client bundle.
//
// The signing core lives in lib/signed-token.ts and is shared with the retreat
// guest-hub grant; the difference here is that the payload is a bare `scope`,
// so one module serves every gated area.

import { nowSeconds, safeEqual, signToken, signedCookieOptions, verifyToken } from "@/kernel/identity/signed-token";

// A scope lives beside the unlock action it gates, in its own module: a
// `'use server'` file may only export async functions, so it cannot hold the
// constant, and a typo in a scope string is a silent gate bypass.
//
// The private library's scope is here because the kernel's own tests use it as
// the worked example. A per-client scope is NOT: naming one in the kernel puts
// a client in the one layer every fork receives, and the route that gates it is
// internal, so the constant was dead there anyway.
export const PRIVATE_LIBRARY_SCOPE = "private-library";

// The cookie the retired client-side PrivateGate set. It was only ever the
// literal "1", so it proves nothing; unlocking clears it so browsers that still
// carry one are not left with a dead cookie forever.
export const LEGACY_PRIVATE_COOKIE = "edge8_private_ok";

export const DEFAULT_GATE_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

// Prefer a dedicated secret; fall back to the server-only Supabase secret so a
// missing ACCESS_GATE_SECRET never breaks a deploy. Both are server-only — this
// must never be read from a NEXT_PUBLIC_ variable, or the key ships to clients.
function secret(): string {
  const s = process.env.ACCESS_GATE_SECRET || process.env.SUPABASE_SECRET_KEY;
  if (!s) throw new Error("ACCESS_GATE_SECRET (or SUPABASE_SECRET_KEY) must be set");
  return s;
}

interface GatePayload {
  scope: string;
  exp: number; // epoch seconds
}

// Constant-time comparison of a user-supplied code against the configured one.
// Exported because every unlock action needs it and each one hand-rolling the
// comparison is how a plain `===` sneaks back in.
export function safeCompareCode(supplied: string, expected: string): boolean {
  return safeEqual(supplied, expected);
}

export async function signGate(
  scope: string,
  ttlSeconds: number = DEFAULT_GATE_TTL_SECONDS,
): Promise<{ token: string; maxAgeSeconds: number }> {
  const payload: GatePayload = { scope, exp: nowSeconds() + ttlSeconds };
  return { token: await signToken(payload, { secret: secret() }), maxAgeSeconds: ttlSeconds };
}

// Verify signature, scope and expiry. Returns a plain boolean because no caller
// wants anything out of the payload — the whole grant is "yes, this scope".
export async function verifyGate(token: string | undefined | null, scope: string): Promise<boolean> {
  const payload = await verifyToken<GatePayload>(token, { secret: secret() }, (p) => {
    if (!p || typeof p !== "object") return null;
    const { scope: s, exp } = p as Partial<GatePayload>;
    return typeof s === "string" && typeof exp === "number" ? { scope: s, exp } : null;
  });
  return payload !== null && payload.scope === scope;
}

export function gateCookieName(scope: string): string {
  return `edge8_gate_${scope}`;
}

export const gateCookieOptions = signedCookieOptions;

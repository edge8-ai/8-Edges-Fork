// The one HMAC-signed token core behind every server-trusted cookie or link in
// the app: the scope gate (lib/access-gate.ts) and the retreat guest-hub grant
// and email-verification link (lib/my-retreat/access.ts). Each of those used to
// carry its own copy of these helpers; a fix to one silently missed the others.
//
// Token shape is `<base64url(JSON payload)>.<base64url(HMAC-SHA256)>`, signed
// over `purpose + body`. `purpose` domain-separates token families that share a
// secret so one can never be replayed as another; the empty purpose is kept for
// families that were already issued before purposes existed, so cookies in the
// wild stay valid. Web Crypto (crypto.subtle) so this runs in Node route
// handlers, server actions and, if ever needed, the edge runtime.

const enc = new TextEncoder();

function bytesToB64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function strToB64url(str: string): string {
  return bytesToB64url(enc.encode(str));
}
function b64urlToStr(b64url: string): string {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function hmac(secret: string, body: string, purpose: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(purpose + body));
  return bytesToB64url(new Uint8Array(sig));
}

// Constant-time in the compare loop. The early length return leaks nothing when
// both operands are fixed-length HMACs; for user-supplied codes it leaks only
// the length, which the caller has already accepted by using this.
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export interface SigningKey {
  // The server-only secret. Resolved lazily by the caller so a missing env var
  // fails at first use, not at import.
  secret: string;
  // Domain separator; "" for token families issued before purposes existed.
  purpose?: string;
}

// Every payload carries an absolute expiry in epoch seconds.
interface ExpiringPayload {
  exp: number;
}

export async function signToken<T extends ExpiringPayload>(payload: T, key: SigningKey): Promise<string> {
  const body = strToB64url(JSON.stringify(payload));
  return `${body}.${await hmac(key.secret, body, key.purpose ?? "")}`;
}

// Verify signature and expiry, then hand the parsed payload to `validate`, which
// narrows the shape (and rejects anything else by returning null). Never throws
// on malformed input — tokens arrive from cookies and query strings.
export async function verifyToken<T extends ExpiringPayload>(
  token: string | undefined | null,
  key: SigningKey,
  validate: (payload: unknown) => T | null,
): Promise<T | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!sig) return null;
  if (!safeEqual(sig, await hmac(key.secret, body, key.purpose ?? ""))) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(b64urlToStr(body));
  } catch {
    return null;
  }
  const payload = validate(parsed);
  if (!payload) return null;
  if (typeof payload.exp !== "number" || payload.exp <= nowSeconds()) return null;
  return payload;
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

// Cookie attributes every signed-token cookie shares.
export function signedCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    // Secure only in production — a `secure` cookie is dropped over http://localhost.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

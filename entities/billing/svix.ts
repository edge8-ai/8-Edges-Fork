import { createHmac, timingSafeEqual } from "node:crypto";

// Svix webhook signature verification, which is what Resend uses.
//
// Implemented here rather than pulling in the `svix` package: the scheme is
// small, stable, and documented, and a webhook verifier is exactly the kind of
// code you want to be able to read in full at the point of use.
//
// The signed payload is `${id}.${timestamp}.${rawBody}`, HMAC-SHA256'd with the
// secret (base64, after the `whsec_` prefix), compared base64 against the
// `v1,<sig>` entries in the svix-signature header. That header can carry several
// signatures during a secret rotation, so any match passes.

const TOLERANCE_SECONDS = 5 * 60;

export type SvixHeaders = {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
};

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export function readSvixHeaders(headers: Headers): SvixHeaders {
  return {
    id: headers.get("svix-id"),
    timestamp: headers.get("svix-timestamp"),
    signature: headers.get("svix-signature"),
  };
}

function secretBytes(secret: string): Buffer {
  const raw = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  return Buffer.from(raw, "base64");
}

// Constant-time compare that does not leak length. timingSafeEqual throws on a
// length mismatch, so guard first — a differing length is already a mismatch.
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function verifySvixSignature(opts: {
  rawBody: string;
  headers: SvixHeaders;
  secret: string;
  now?: number;
}): VerifyResult {
  const { rawBody, headers, secret } = opts;
  const { id, timestamp, signature } = headers;

  if (!id || !timestamp || !signature) {
    return { ok: false, reason: "Missing svix-id, svix-timestamp, or svix-signature header." };
  }

  // Replay guard. Without it a captured payload stays valid forever.
  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) {
    return { ok: false, reason: "svix-timestamp is not a number." };
  }
  const nowSeconds = Math.floor((opts.now ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - sentAt) > TOLERANCE_SECONDS) {
    return { ok: false, reason: "Timestamp outside the tolerance window." };
  }

  const expected = createHmac("sha256", secretBytes(secret))
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");

  // "v1,sigA v1,sigB" — several signatures during a secret rotation.
  const provided = signature
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v1,"))
    .map((part) => part.slice("v1,".length));

  if (provided.length === 0) {
    return { ok: false, reason: "No v1 signature in svix-signature header." };
  }
  if (!provided.some((sig) => safeEqual(sig, expected))) {
    return { ok: false, reason: "Signature mismatch." };
  }
  return { ok: true };
}

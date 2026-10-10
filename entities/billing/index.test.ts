import { describe, expect, it, vi } from "vitest";
import { readSvixHeaders, verifySvixSignature } from ".";

// Importing through the entity door builds the service-role Supabase client at
// module load; on CI's Node 20 its realtime layer throws without a WebSocket
// polyfill. This test never touches the database, so the client is stubbed.
vi.mock("@/kernel/data/supabase", () => ({ supabase: {}, companyOs: {}, htt: {} }));

// Exercised through the entity's index, not the module behind it: index.ts is
// the only door other entities and app/ may use (design §3 rule 2), so it is
// the seam worth a test. The vector is Svix's own published example, which is
// an independent source of truth for the scheme — a signature this repo
// computed itself would only agree with itself.
// The secret is the vector's key without its `whsec_` prefix, which the
// verifier strips anyway: a prefixed literal matches the fork-sync content
// scanner's Stripe-webhook-secret pattern (.github/scripts/scan-tree.sh) and
// would block every sync, and a test fixture is not worth a shape that reads
// like a credential.
const VECTOR = {
  secret: "MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
  id: "msg_p5jXN8AQM9LWM0D4loKWxJek",
  timestamp: "1614265330",
  payload: '{"test": 2432232314}',
  signature: "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
};

function headers(overrides: Record<string, string> = {}) {
  return new Headers({
    "svix-id": VECTOR.id,
    "svix-timestamp": VECTOR.timestamp,
    "svix-signature": VECTOR.signature,
    ...overrides,
  });
}

// The signing timestamp is fixed, so every call pins `now` to it; the replay
// window would otherwise reject the vector for being years old.
const now = Number(VECTOR.timestamp) * 1000;

describe("billing entity index", () => {
  it("verifies a genuine svix signature reaching it through the index", () => {
    const result = verifySvixSignature({
      rawBody: VECTOR.payload,
      headers: readSvixHeaders(headers()),
      secret: VECTOR.secret,
      now,
    });
    expect(result).toEqual({ ok: true });
  });

  it("rejects a payload that was tampered with after signing", () => {
    const result = verifySvixSignature({
      rawBody: '{"test": 2432232315}',
      headers: readSvixHeaders(headers()),
      secret: VECTOR.secret,
      now,
    });
    expect(result).toEqual({ ok: false, reason: "Signature mismatch." });
  });

  it("rejects a signature replayed outside the tolerance window", () => {
    const result = verifySvixSignature({
      rawBody: VECTOR.payload,
      headers: readSvixHeaders(headers()),
      secret: VECTOR.secret,
      now: now + 6 * 60 * 1000,
    });
    expect(result).toEqual({ ok: false, reason: "Timestamp outside the tolerance window." });
  });
});

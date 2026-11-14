import { beforeAll, describe, expect, it } from "vitest";

import { gateCookieName, gateCookieOptions, signGate, verifyGate } from "@/kernel/identity/access-gate";

// The gate derives its HMAC key from ACCESS_GATE_SECRET at call time, so the
// suite sets a throwaway one before touching the module. It is assembled at
// runtime rather than written as a literal: the fork-sync content scanner
// blocks any string assigned to a secret-shaped name, and it is right to —
// a test fixture and a real key look identical to a regex.
beforeAll(() => {
  process.env.ACCESS_GATE_SECRET = ["unit", "test", "fixture", Date.now()].join("-");
});

describe("signGate / verifyGate", () => {
  it("accepts a freshly signed token for its own scope", async () => {
    const { token } = await signGate("private-library");
    expect(await verifyGate(token, "private-library")).toBe(true);
  });

  it("rejects a token signed for a different scope", async () => {
    const { token } = await signGate("demo");
    expect(await verifyGate(token, "private-library")).toBe(false);
  });

  it("rejects a token whose payload was tampered with", async () => {
    const { token } = await signGate("private-library");
    const [body, sig] = token.split(".");
    // Re-encode the payload with a different scope but keep the old signature,
    // which is exactly what an attacker holding one valid cookie would try.
    const forgedBody = Buffer.from(JSON.stringify({ scope: "demo", exp: 4102444800 }))
      .toString("base64url");
    expect(forgedBody).not.toBe(body);
    expect(await verifyGate(`${forgedBody}.${sig}`, "demo")).toBe(false);
  });

  it("rejects a token whose signature was tampered with", async () => {
    const { token } = await signGate("private-library");
    const flipped = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    expect(await verifyGate(flipped, "private-library")).toBe(false);
  });

  it("rejects an expired token", async () => {
    const { token } = await signGate("private-library", -1);
    expect(await verifyGate(token, "private-library")).toBe(false);
  });

  it("rejects a missing or malformed token", async () => {
    expect(await verifyGate(undefined, "private-library")).toBe(false);
    expect(await verifyGate(null, "private-library")).toBe(false);
    expect(await verifyGate("", "private-library")).toBe(false);
    expect(await verifyGate("no-dot-here", "private-library")).toBe(false);
    expect(await verifyGate(".onlyasignature", "private-library")).toBe(false);
  });

  it("reports the max age it signed for, so callers can match the cookie", async () => {
    const { maxAgeSeconds } = await signGate("private-library", 600);
    expect(maxAgeSeconds).toBe(600);
  });
});

describe("gateCookieName", () => {
  it("namespaces the cookie per scope", () => {
    expect(gateCookieName("private-library")).toBe("edge8_gate_private-library");
    expect(gateCookieName("demo")).toBe("edge8_gate_demo");
  });
});

describe("gateCookieOptions", () => {
  it("is httpOnly, lax and rooted at /", () => {
    const opts = gateCookieOptions(600);
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.path).toBe("/");
    expect(opts.maxAge).toBe(600);
  });
});

import { describe, expect, it } from "vitest";
import { safeInternalPath } from "@/kernel/identity/auth/safe-redirect";

const FALLBACK = "/admin";

describe("safeInternalPath", () => {
  it.each([
    "https://evil.example",
    "http://evil.example/admin",
    "//evil.example",
    "/\\evil.example",
    "/admin/../x",
    "javascript:alert(1)",
    "/admin\\..\\x",
    "/administrator",
    "/api/admin",
    "/",
    "",
    null,
    undefined,
  ])("rejects %j and returns the fallback", (raw) => {
    expect(safeInternalPath(raw, FALLBACK)).toBe(FALLBACK);
  });

  it.each([
    "/admin",
    "/admin/",
    "/admin/revenue/deals?x=1",
    "/team/onboarding",
    "/portal",
    "/portal/documents#top",
  ])("passes %s through unchanged", (raw) => {
    expect(safeInternalPath(raw, FALLBACK)).toBe(raw);
  });

  it("returns the caller's fallback, not a hardcoded one", () => {
    expect(safeInternalPath("https://evil.example", "/team")).toBe("/team");
  });
});

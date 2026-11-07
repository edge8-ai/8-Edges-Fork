import { describe, expect, it } from "vitest";
import { generateTemporaryPassword, passwordGate, temporaryPasswordMetadata } from "./temporary-password";
import { TEMPORARY_PASSWORD_HOURS } from "./temporary-password-hours";

const now = new Date("2026-10-14T12:00:00Z");
// The flag lives in app_metadata, which only the server can write (CI.4).
const flagged = (expiresAt: string) => ({ app_metadata: { must_change_password: true, temp_password_expires_at: expiresAt } });

describe("generateTemporaryPassword", () => {
  it("is two words and four digits, readable aloud", () => {
    expect(generateTemporaryPassword()).toMatch(/^[A-Z][a-z]+-[A-Z][a-z]+-\d{4}$/);
  });
  it("differs between calls", () => {
    const seen = new Set(Array.from({ length: 20 }, generateTemporaryPassword));
    expect(seen.size).toBeGreaterThan(15);
  });
});

describe("temporaryPasswordMetadata", () => {
  it("flags the change and stamps the expiry", () => {
    expect(temporaryPasswordMetadata(now)).toEqual({
      must_change_password: true,
      temp_password_expires_at: new Date(now.getTime() + TEMPORARY_PASSWORD_HOURS * 3_600_000).toISOString(),
    });
  });
});

describe("passwordGate", () => {
  it("lets an ordinary account through", () => {
    expect(passwordGate({ app_metadata: {} }, "/team", now)).toBeNull();
    expect(passwordGate({ app_metadata: null }, "/team", now)).toBeNull();
    expect(passwordGate({}, "/team", now)).toBeNull();
    expect(passwordGate({ app_metadata: { must_change_password: false } }, "/admin", now)).toBeNull();
  });

  it("ignores a flag in user_metadata, which the holder could clear from the browser", () => {
    // The portal's own flag lives there too; the portal layout reads it, the proxy does not.
    const selfFlagged = { app_metadata: { provider: "email" }, user_metadata: { must_change_password: true, temp_password_expires_at: "2026-10-15T00:00:00Z" } };
    expect(passwordGate(selfFlagged, "/team", now)).toBeNull();
  });

  it("sends a temporary password to its surface's password page", () => {
    const user = flagged("2026-10-15T00:00:00Z");
    expect(passwordGate(user, "/team/boards", now)).toEqual({ redirect: "/team/change-password", signOut: false });
    expect(passwordGate(user, "/admin/settings", now)).toEqual({ redirect: "/admin/reset-password", signOut: false });
  });

  it("leaves the portal to its own layout gate", () => {
    expect(passwordGate(flagged("2026-10-15T00:00:00Z"), "/portal", now)).toBeNull();
    expect(passwordGate(flagged("2026-10-14T11:00:00Z"), "/portal/home", now)).toBeNull();
  });

  it("signs out an unused temporary password once it has expired", () => {
    expect(passwordGate(flagged("2026-10-14T11:59:59Z"), "/team", now)).toEqual({ redirect: "/team/login", signOut: true });
    expect(passwordGate(flagged("2026-10-14T12:00:00Z"), "/admin", now)).toEqual({ redirect: "/admin/login", signOut: true });
  });

  it("treats a flag without an expiry as not expired", () => {
    expect(passwordGate({ app_metadata: { must_change_password: true } }, "/team", now)).toEqual({ redirect: "/team/change-password", signOut: false });
  });

  it("does not mistake a path that only begins with a surface's letters for that surface", () => {
    expect(passwordGate(flagged("2026-10-15T00:00:00Z"), "/teams-page", now)).toBeNull();
    expect(passwordGate(flagged("2026-10-15T00:00:00Z"), "/administration", now)).toBeNull();
  });
});

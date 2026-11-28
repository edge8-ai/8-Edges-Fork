import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Team assume (PR 2 of the contractor portal plan): a session is honoured only
// for the Super Admin who started it, while it is open, and only for the Team
// view; and while it is honoured every write is refused.

let cookie: string | undefined;
let requestHeaders: Record<string, string> = {};
let superAdmin = true;

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (cookie ? { value: cookie } : undefined) }),
  headers: async () => ({ get: (k: string) => requestHeaders[k.toLowerCase()] ?? null }),
}));
vi.mock("@/kernel/identity/admin-register", () => ({ holdsSuperAdminGrant: async () => superAdmin }));

const { readTeamAssumeSession, refuseWritesWhileAssuming, READ_ONLY_WHILE_ASSUMING } = await import("./team-assume");

const OPEN = {
  id: "s-1",
  person_id: "p-lan-anh",
  started_by: "dave@example.test",
  expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  ended_at: null,
  surface: "team",
};

beforeEach(() => {
  resetFake();
  cookie = "s-1";
  requestHeaders = {};
  superAdmin = true;
});
afterEach(() => vi.clearAllMocks());

describe("readTeamAssumeSession", () => {
  it("honours an open team session for the admin who started it", async () => {
    script("portal_assume_sessions", { data: OPEN });
    expect(await readTeamAssumeSession("dave@example.test")).toMatchObject({ personId: "p-lan-anh", sessionId: "s-1", adminEmail: "dave@example.test" });
  });

  it("reads nothing at all without the cookie", async () => {
    cookie = undefined;
    expect(await readTeamAssumeSession("dave@example.test")).toBeNull();
  });

  it.each([
    ["another admin's session", { started_by: "someone@example.test" }],
    ["an ended session", { ended_at: new Date().toISOString() }],
    ["an expired session", { expires_at: new Date(Date.now() - 1000).toISOString() }],
    ["a client portal session", { surface: "portal" }],
  ])("refuses %s", async (_, patch) => {
    script("portal_assume_sessions", { data: { ...OPEN, ...patch } });
    expect(await readTeamAssumeSession("dave@example.test")).toBeNull();
  });

  it("ends with the Super Admin grant", async () => {
    superAdmin = false;
    script("portal_assume_sessions", { data: OPEN });
    expect(await readTeamAssumeSession("dave@example.test")).toBeNull();
  });
});

describe("refuseWritesWhileAssuming", () => {
  const assuming = { adminEmail: "dave@example.test", sessionId: "s-1", expiresAt: OPEN.expires_at };

  it("lets a page render while assuming", async () => {
    await expect(refuseWritesWhileAssuming(assuming)).resolves.toBeUndefined();
  });

  it("refuses a server action and a form post while assuming", async () => {
    requestHeaders = { "next-action": "abc" };
    await expect(refuseWritesWhileAssuming(assuming)).rejects.toThrow(READ_ONLY_WHILE_ASSUMING);
    requestHeaders = { "content-type": "multipart/form-data; boundary=x" };
    await expect(refuseWritesWhileAssuming(assuming)).rejects.toThrow(READ_ONLY_WHILE_ASSUMING);
  });

  it("never refuses someone signed in as themselves", async () => {
    requestHeaders = { "next-action": "abc" };
    await expect(refuseWritesWhileAssuming(null)).resolves.toBeUndefined();
  });
});

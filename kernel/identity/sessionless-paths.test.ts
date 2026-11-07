// Two things the proxy (the edge middleware until B.18.3) has got wrong twice (PR #1022 for /verify,
// the 2026-09-05 bug-hunt for /admin/reset-password): an auth page that is
// missing from the session-less list bounces its own users to login. So the
// list is held against the tree — every page in an `(auth)` route group must
// be listed — and the proxy itself is run against a request with no
// session to prove the listed paths pass and everything else redirects.
import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { SESSIONLESS_PREFIXES, isSessionlessPath } from "./sessionless-paths";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SURFACES = ["admin", "team", "portal"];

/** `/<surface>/<page>` for every page directory under `app/<surface>/(auth)/`. */
function authGroupPages(): string[] {
  const out: string[] = [];
  for (const surface of SURFACES) {
    const group = path.join(ROOT, "app", surface, "(auth)");
    if (!fs.existsSync(group)) continue;
    for (const entry of fs.readdirSync(group, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (fs.existsSync(path.join(group, entry.name, "page.tsx"))) out.push(`/${surface}/${entry.name}`);
    }
  }
  return out.sort();
}

// The proxy builds a Supabase client from two public env vars and asks it
// for the user; with no session it gets null. The client is stubbed so the
// test needs neither network nor env beyond the two names.
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

describe("session-less paths", () => {
  it("lists every page of every (auth) route group", () => {
    const pages = authGroupPages();
    expect(pages.length).toBeGreaterThanOrEqual(8);
    const missing = pages.filter((p) => !isSessionlessPath(p));
    expect(missing, "auth pages the proxy would bounce to login").toEqual([]);
  });

  it("lists only auth pages, the invite callbacks and the auth API", () => {
    const pages = new Set(authGroupPages());
    const extra = SESSIONLESS_PREFIXES.filter((p) => !pages.has(p) && p !== "/api/auth");
    expect(extra).toEqual([]);
  });

  it("matches a prefix as a path segment, not as a string prefix", () => {
    expect(isSessionlessPath("/admin/login")).toBe(true);
    expect(isSessionlessPath("/admin/login/")).toBe(true);
    expect(isSessionlessPath("/admin/verify/anything")).toBe(true);
    expect(isSessionlessPath("/admin/logins")).toBe(false);
    expect(isSessionlessPath("/admin")).toBe(false);
    expect(isSessionlessPath("/portal/settings")).toBe(false);
  });
});

describe("proxy without a session", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-key";
  });

  async function run(pathname: string) {
    const { proxy } = await import("@/proxy");
    return proxy(new NextRequest(`https://www.example.com${pathname}`));
  }

  it("lets the recovery landing page through, hash and all", async () => {
    // The recovery link lands here with the session in the URL hash, which the
    // server never sees; a bounce to login is exactly the production bug.
    const res = await run("/admin/reset-password");
    expect(res.status).toBe(200);
  });

  it("bounces a gated page to its own surface's login with a redirect back", async () => {
    for (const [pathname, login] of [
      ["/admin/settings", "/admin/login"],
      ["/team/time-off", "/team/login"],
      ["/portal/invoices", "/portal/login"],
    ]) {
      const res = await run(pathname);
      expect(res.status).toBe(307);
      const location = new URL(res.headers.get("location") ?? "");
      expect(location.pathname).toBe(login);
      expect(location.searchParams.get("redirect")).toBe(pathname);
    }
  });
});

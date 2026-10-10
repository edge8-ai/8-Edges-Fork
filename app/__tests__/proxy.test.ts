// The proxy (middleware.ts until Next 16, B.18.3) run with a real NextRequest,
// so a rename or a runtime move that changes what a visitor sees fails here:
// the pass-through when auth is not configured, the redirect to each surface's
// own login with the return path, and the surface header the shared Revenue
// screens build their links from, set in both cases.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { SURFACE_HEADER } from "@/kernel/shell/surface-shared";

// Only the client factory is replaced, and only to answer "no user"; the rest
// of @supabase/ssr stays real, so a change in how the proxy uses it still
// reaches the real module.
const getUser = vi.fn(async () => ({ data: { user: null } }));
vi.mock("@supabase/ssr", async (importActual) => ({
  ...(await importActual<typeof import("@supabase/ssr")>()),
  createServerClient: vi.fn(() => ({ auth: { getUser } })),
}));

const ENV = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] as const;
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

async function run(pathAndQuery: string) {
  const { proxy } = await import("@/proxy");
  const request = new NextRequest(`https://www.example.com${pathAndQuery}`);
  const response = await proxy(request);
  return { request, response };
}

describe("proxy with auth not configured", () => {
  beforeEach(() => {
    for (const k of ENV) delete process.env[k];
  });

  it.each([
    ["/admin/revenue/deals", "admin"],
    ["/team/workboard", "team"],
    ["/portal/home", "admin"],
  ])("passes %s through and forwards the %s surface header", async (pathname, surface) => {
    const { request, response } = await run(pathname);
    expect(response.headers.get("location")).toBeNull();
    // NextResponse.next({ request }) forwards the modified request headers as
    // x-middleware-request-* on the response; that is how the page sees them.
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get(`x-middleware-request-${SURFACE_HEADER}`)).toBe(surface);
    expect(request.headers.get(SURFACE_HEADER)).toBe(surface);
  });
});

describe("proxy with no signed-in user", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-key";
    getUser.mockClear();
  });

  it.each([
    ["/admin/revenue/deals?range=90d", "/admin/login", "admin"],
    ["/team/workboard", "/team/login", "team"],
    ["/portal/requests/42", "/portal/login", "admin"],
  ])("redirects %s to %s with the return path, and sets the %s surface header", async (pathAndQuery, login, surface) => {
    const { request, response } = await run(pathAndQuery);
    expect(getUser).toHaveBeenCalledTimes(1);
    expect([307, 308]).toContain(response.status);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe(login);
    expect(location.searchParams.get("redirect")).toBe(pathAndQuery);
    expect(request.headers.get(SURFACE_HEADER)).toBe(surface);
  });

  it("lets a session-less auth page through without asking for the user", async () => {
    const { response } = await run("/team/login");
    expect(getUser).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get(`x-middleware-request-${SURFACE_HEADER}`)).toBe("team");
  });

  it("fails safe to the login page when the auth backend throws", async () => {
    getUser.mockRejectedValueOnce(new Error("auth down"));
    const { response } = await run("/admin/people");
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/admin/login");
  });
});

describe("proxy config", () => {
  it("matches exactly the three authenticated surfaces", async () => {
    const { config } = await import("@/proxy");
    expect(config.matcher).toEqual(["/admin/:path*", "/team/:path*", "/portal/:path*"]);
  });
});

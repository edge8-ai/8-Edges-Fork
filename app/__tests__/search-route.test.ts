import { beforeEach, describe, expect, it, vi } from "vitest";

// SR.1.7. The palette posts to app/api/search/route.ts, which the proxy does not
// run on. So the route makes the two checks a page request gets there: the
// request comes from this site (as Next checks a server action), and an account
// still on a temporary password, or one that expired, gets no answer
// (passwordGate, which the proxy applies to /admin and /team). The surface's
// own function guards the rest and is mocked here.
const searchAdmin = vi.fn(async (query: unknown) => ({ query: String(query), groups: [{ kind: "card", label: "Cards", hits: [], failed: false }] }));
const searchTeam = vi.fn(async (query: unknown) => ({ query: String(query), groups: [] }));
vi.mock("@/app/search", () => ({ searchAdmin: (q: unknown) => searchAdmin(q), searchTeam: (q: unknown) => searchTeam(q) }));
let authUser: Record<string, unknown> | null = null;
vi.mock("@/kernel/identity/session-user", () => ({ getAuthUser: async () => authUser }));

import { POST } from "@/app/api/search/route";

const post = (body: unknown, origin: string | null = "http://localhost:3000") =>
  POST(
    new Request("http://localhost:3000/api/search/", {
      method: "POST",
      headers: { "content-type": "application/json", host: "localhost:3000", ...(origin ? { origin } : {}) },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  authUser = { id: "u1", email: "anna@example.test", app_metadata: {} };
  searchAdmin.mockClear();
  searchTeam.mockClear();
});

describe("the search route", () => {
  it("answers the surface the body names, through that surface's guarded function", async () => {
    const admin = await post({ surface: "admin", query: "palette" });
    expect(admin.status).toBe(200);
    expect(await admin.json()).toMatchObject({ query: "palette" });
    expect(searchAdmin).toHaveBeenCalledWith("palette");
    await post({ surface: "team", query: "palette" });
    expect(searchTeam).toHaveBeenCalledWith("palette");
  });

  it("asks the admin function, which refuses anyone without surface.admin, for any other surface", async () => {
    await post({ surface: "portal", query: "x" });
    expect(searchAdmin).toHaveBeenCalledOnce();
    expect(searchTeam).not.toHaveBeenCalled();
  });

  it("refuses a request from another site, or one that names no site, before anything is read", async () => {
    expect((await post({ surface: "admin", query: "x" }, "https://evil.example")).status).toBe(403);
    expect((await post({ surface: "admin", query: "x" }, null)).status).toBe(403);
    expect(searchAdmin).not.toHaveBeenCalled();
  });

  it("gives an account on a temporary password no answer, as the proxy gives it no page", async () => {
    authUser = { id: "u1", email: "anna@example.test", app_metadata: { must_change_password: true } };
    const unchanged = await post({ surface: "team", query: "palette" });
    expect(unchanged.status).toBe(403);
    expect(await unchanged.text()).toBe("");
    authUser = {
      id: "u1",
      email: "anna@example.test",
      app_metadata: { must_change_password: true, temp_password_expires_at: "2020-01-01T00:00:00Z" },
    };
    expect((await post({ surface: "admin", query: "palette" })).status).toBe(403);
  });
});

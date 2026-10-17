import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { larkOpenIdByEmail, resetLarkDirectory, sendLarkDm } from "./lark-api";

// The opt-out read hits people; these tests are about the Lark API's own
// failure shapes, so nobody has opted out unless a test says so.
const optedOut = vi.hoisted(() => ({ value: false }));
vi.mock("./dm-preference", () => ({ larkDmOptedOut: async () => optedOut.value }));
vi.mock("./lark-log", () => ({ logLarkMessage: async () => {} }));

// Lark's gateway answers a path it does not serve with HTTP 404, text/plain,
// "404 page not found". The Minutes list endpoint is one of those for a tenant
// app, so once LARK_APP_ID and LARK_APP_SECRET reached production (2026-09-09)
// the daily coaching cycle called it, res.json() threw "Unexpected
// non-whitespace character after JSON at position 4", and every run from
// 2026-09-10 died before walking a single profile. The client promises to be
// fail-soft; these tests pin that a body which is not JSON degrades instead.

type Answer = { body: string; status: number };

function lark(answers: Record<string, Answer>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/auth/v3/tenant_access_token/internal")) {
        return new Response(JSON.stringify({ code: 0, tenant_access_token: "t", expire: 7200 }));
      }
      const hit = Object.entries(answers).find(([path]) => url.includes(path));
      if (!hit) throw new Error(`unexpected fetch ${url}`);
      return new Response(hit[1].body, { status: hit[1].status });
    }),
  );
}

const NOT_FOUND: Answer = { body: "404 page not found", status: 404 };

describe("lark-api with a body that is not JSON", () => {
  beforeEach(() => {
    vi.stubEnv("LARK_APP_ID", "app");
    vi.stubEnv("LARK_APP_SECRET", "secret");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("skips the DM when the open_id lookup answers a plain-text 404", async () => {
    lark({ "/contact/v3/users/batch_get_id": NOT_FOUND });
    await expect(sendLarkDm("member@example.com", "hi")).resolves.toBe(false);
  });

  it("reports a failed DM when the message endpoint answers an HTML error page", async () => {
    lark({
      "/contact/v3/users/batch_get_id": {
        body: JSON.stringify({ code: 0, data: { user_list: [{ email: "member@example.com", user_id: "ou_1" }] } }),
        status: 200,
      },
      "/im/v1/messages": { body: "<html>502 Bad Gateway</html>", status: 502 },
    });
    await expect(sendLarkDm("member@example.com", "hi")).resolves.toBe(false);
  });

  it("skips the DM for a person who opted out, before any Lark call", async () => {
    // lark({}) throws on any request past the token call, so a lookup or a
    // send would fail the test loudly rather than pass by accident.
    optedOut.value = true;
    lark({});
    try {
      await expect(sendLarkDm("member@example.com", "hi")).resolves.toBe(false);
      expect((fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(0);
    } finally {
      optedOut.value = false;
    }
  });

  it("still sends the DM when both calls answer JSON with code 0", async () => {
    lark({
      "/contact/v3/users/batch_get_id": {
        body: JSON.stringify({ code: 0, data: { user_list: [{ email: "member@example.com", user_id: "ou_1" }] } }),
        status: 200,
      },
      "/im/v1/messages": { body: JSON.stringify({ code: 0, msg: "success" }), status: 200 },
    });
    await expect(sendLarkDm("member@example.com", "hi")).resolves.toBe(true);
  });
});

// Lark answers `batch_get_id` for an address it does not hold as the PRIMARY
// one by echoing the address back with no user_id — the same shape as a person
// who is not in the tenant at all. Against the real tenant on 2026-09-22 that
// was a third of the company: 14 of 43 people had no primary address, all 43
// had an enterprise one. These tests pin the second lookup that tells the two
// apart, and the two traps that make a naive version of it wrong.
describe("resolving a person Lark holds under enterprise_email", () => {
  // The shape of the answer when the address is not the primary one.
  const NO_PRIMARY = {
    body: JSON.stringify({ code: 0, data: { user_list: [{ email: "member@example.com" }] } }),
    status: 200,
  };

  // A tenant with one child department, and the person we want in the CHILD —
  // the root department holds 32 of this tenant's 43 people, so a walk that
  // stops at the root misses eleven of them.
  function tenant(overrides: Record<string, Answer> = {}): void {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/auth/v3/tenant_access_token/internal")) {
          return new Response(JSON.stringify({ code: 0, tenant_access_token: "t", expire: 7200 }));
        }
        const override = Object.entries(overrides).find(([path]) => url.includes(path));
        if (override) return new Response(override[1].body, { status: override[1].status });
        if (url.includes("/contact/v3/users/batch_get_id")) return new Response(NO_PRIMARY.body);
        if (url.includes("/departments/0/children")) {
          return new Response(JSON.stringify({ code: 0, data: { items: [{ open_department_id: "od_child" }] } }));
        }
        if (url.includes("department_id=od_child")) {
          return new Response(
            JSON.stringify({
              code: 0,
              data: { items: [{ open_id: "ou_child", enterprise_email: "Member@Example.com" }] },
            }),
          );
        }
        if (url.includes("department_id=0")) {
          return new Response(
            JSON.stringify({ code: 0, data: { items: [{ open_id: "ou_root", email: "someone@example.com" }] } }),
          );
        }
        if (url.includes("/im/v1/messages")) return new Response(JSON.stringify({ code: 0 }));
        throw new Error(`unexpected fetch ${url}`);
      }),
    );
  }

  const calls = (): string[] =>
    (fetch as unknown as { mock: { calls: [string][] } }).mock.calls.map(([url]) => url);

  beforeEach(() => {
    vi.stubEnv("LARK_APP_ID", "app");
    vi.stubEnv("LARK_APP_SECRET", "secret");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    resetLarkDirectory();
  });
  afterEach(() => {
    resetLarkDirectory();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("finds a person whose address Lark holds only as enterprise_email", async () => {
    tenant();
    await expect(larkOpenIdByEmail("member@example.com")).resolves.toBe("ou_child");
  });

  it("walks child departments, not only the root", async () => {
    tenant();
    await larkOpenIdByEmail("member@example.com");
    expect(calls().some((u) => u.includes("department_id=od_child"))).toBe(true);
  });

  it("matches regardless of the case Lark stores the address in", async () => {
    // The directory answers "Member@Example.com"; nobody types it that way.
    tenant();
    await expect(larkOpenIdByEmail("MEMBER@example.com")).resolves.toBe("ou_child");
  });

  it("reads the directory once for two lookups", async () => {
    tenant();
    await larkOpenIdByEmail("member@example.com");
    const first = calls().filter((u) => u.includes("find_by_department")).length;
    // Assert the walk happened before asserting it did not happen twice —
    // otherwise a lookup that never walks at all passes this test on 0 === 0.
    expect(first).toBeGreaterThan(0);
    await larkOpenIdByEmail("member@example.com");
    expect(calls().filter((u) => u.includes("find_by_department")).length).toBe(first);
  });

  it("does not walk the directory at all when the primary lookup answers", async () => {
    tenant({
      "/contact/v3/users/batch_get_id": {
        body: JSON.stringify({ code: 0, data: { user_list: [{ email: "member@example.com", user_id: "ou_1" }] } }),
        status: 200,
      },
    });
    await expect(larkOpenIdByEmail("member@example.com")).resolves.toBe("ou_1");
    expect(calls().some((u) => u.includes("find_by_department"))).toBe(false);
  });

  it("answers null, and says the directory was unreadable, when the walk fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    tenant({ "/departments/0/children": NOT_FOUND });
    await expect(larkOpenIdByEmail("member@example.com")).resolves.toBeNull();
    expect(error.mock.calls.flat().join(" ")).toContain("directory unavailable");
  });

  it("answers null, and says nobody is at that address, when the walk succeeds", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    tenant();
    await expect(larkOpenIdByEmail("nobody@example.com")).resolves.toBeNull();
    expect(warn.mock.calls.flat().join(" ")).toContain("no tenant user at");
  });

  it("does not cache a directory it failed to read", async () => {
    tenant({ "/departments/0/children": NOT_FOUND });
    await larkOpenIdByEmail("member@example.com");
    tenant();
    await expect(larkOpenIdByEmail("member@example.com")).resolves.toBe("ou_child");
  });
});

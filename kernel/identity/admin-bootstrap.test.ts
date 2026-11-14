import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, resetFake, script } from "@/kernel/data/testing/fake-company-os";

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));

import { allowlistBootstrapMessage, allowlistBootstrapWarning } from "./admin-bootstrap";

beforeEach(() => {
  resetFake();
  vi.unstubAllEnvs();
});

describe("allowlistBootstrapMessage", () => {
  it("says nothing on a fresh deployment, where the allowlist is doing its one job", () => {
    expect(allowlistBootstrapMessage(["ops@example.test"], 0)).toBeNull();
  });

  it("says nothing when the allowlist is empty", () => {
    expect(allowlistBootstrapMessage([], 5)).toBeNull();
  });

  it("names every leftover address and what to do, once Admin grants exist", () => {
    const msg = allowlistBootstrapMessage(["b@example.test", "a@example.test"], 5);
    expect(msg).toContain("ADMIN_ALLOWLIST is set (a@example.test, b@example.test) while 5 Admin grants exist");
    expect(msg).toContain("it is bootstrap only and grants nothing now");
    expect(msg).toContain("empty it on Vercel and redeploy");
  });

  it("reads naturally for one grant", () => {
    expect(allowlistBootstrapMessage(["a@example.test"], 1)).toContain("(a@example.test) while 1 Admin grant exists;");
  });

  it("names the addresses with no Admin grant, which are not admins now (AC.20)", () => {
    const msg = allowlistBootstrapMessage(["b@example.test", "a@example.test"], 5, ["b@example.test"]);
    expect(msg).toContain("This address has no Admin grant in Settings, Access, so it cannot enter the Admin view: b@example.test.");
    expect(allowlistBootstrapMessage(["a@example.test"], 5, [])).not.toContain("no Admin grant");
  });
});

describe("allowlistBootstrapWarning", () => {
  it("reads nothing when the allowlist is empty", async () => {
    vi.stubEnv("ADMIN_ALLOWLIST", "");
    expect(await allowlistBootstrapWarning()).toBeNull();
  });

  it("stays quiet while no Admin grant exists, and warns once one does", async () => {
    vi.stubEnv("ADMIN_ALLOWLIST", "ops@example.test");
    script("access_roles", { data: [{ id: "r-admin" }] });
    script("access_role_assignments", { count: 0 });
    expect(await allowlistBootstrapWarning()).toBeNull();

    script("access_roles", { data: [{ id: "r-admin" }] }, { data: [{ id: "r-admin", key: "admin" }] });
    script("access_role_assignments", { count: 2 }, { data: [] });
    script("people", { data: [{ id: "p-ops" }] });
    expect(await allowlistBootstrapWarning()).toContain("cannot enter the Admin view: ops@example.test.");
  });

  it("raises when the grants cannot be counted, rather than calling the allowlist fine", async () => {
    vi.stubEnv("ADMIN_ALLOWLIST", "ops@example.test");
    script("access_roles", { data: [{ id: "r-admin" }] });
    script("access_role_assignments", { error: { message: "boom" } });
    await expect(allowlistBootstrapWarning()).rejects.toThrow(/boom/);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// AC.20: an Admin or Super Admin grant is found from the signed-in email, so an
// admin who is on no team still counts; a failed read answers "no grant", the
// restrictive answer. The counts answer the opposite question, where "none" is
// the permissive answer, so a failed count raises.
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));

import { adminGrantsByEmail, holdsAdminGrant, holdsAdminGrantOrRaise, liveGrantCount, personIdsByEmail } from "./admin-register";
import { ReadFailure } from "@/kernel/data/read";

const ROLES = { data: [{ id: "r-admin", key: "admin" }, { id: "r-super", key: "super-admin" }] };

beforeEach(() => resetFake());

describe("adminGrantsByEmail", () => {
  it("finds both grants of a Super Admin from their email", async () => {
    script("people", { data: [{ id: "p-1" }] });
    script("access_roles", ROLES);
    script("access_role_assignments", { data: [{ role_id: "r-admin" }, { role_id: "r-super" }] });
    expect(await adminGrantsByEmail("Owner@Example.com")).toEqual({ admin: true, superAdmin: true });
  });

  it("answers no grant for nobody, for a person without a grant, and for a failed read", async () => {
    expect(await adminGrantsByEmail(null)).toEqual({ admin: false, superAdmin: false });
    // The role catalogue is read beside the person, not after finding one (SR.1.6).
    script("people", { data: [] });
    script("access_roles", ROLES);
    expect(await adminGrantsByEmail("x@example.com")).toEqual({ admin: false, superAdmin: false });
    script("people", { data: null, error: { message: "boom" } });
    script("access_roles", ROLES);
    expect(await adminGrantsByEmail("x@example.com")).toEqual({ admin: false, superAdmin: false });
  });

  it("matches an address with an underscore as itself, not as a wildcard", async () => {
    script("people", { data: [] });
    script("access_roles", ROLES);
    await adminGrantsByEmail("a_b%c@example.com");
    expect(calls.find((c) => c.table === "people")?.filters).toEqual([["ilike", "email", "a\\_b\\%c@example.com"]]);
  });

  it("finds no grant for an address holding *, which PostgREST would read as a wildcard", async () => {
    script("people", { data: [] });
    script("access_roles", ROLES);
    expect(await adminGrantsByEmail("*@example.com")).toEqual({ admin: false, superAdmin: false });
    expect(calls.find((c) => c.table === "people")?.filters).toEqual([["filter", "email", "in", "()"]]);
  });
});

// A.56: the same register for a caller where "no grant" is the permissive
// answer (the portal's uploader label). holdsAdminGrant keeps answering no.
describe("holdsAdminGrantOrRaise", () => {
  it("answers yes for a live grant, as holdsAdminGrant does", async () => {
    script("people", { data: [{ id: "p-1" }] });
    script("access_roles", ROLES);
    script("access_role_assignments", { data: [{ role_id: "r-admin" }] });
    expect(await holdsAdminGrantOrRaise("Owner@Example.com")).toBe(true);
  });

  it.each(["people", "access_roles", "access_role_assignments"])("raises when the %s read fails, where holdsAdminGrant answers no", async (failing) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const scriptAll = () => {
      script("people", failing === "people" ? { error: { message: "down" } } : { data: [{ id: "p-1" }] });
      script("access_roles", failing === "access_roles" ? { error: { message: "down" } } : ROLES);
      if (failing === "people") return;
      if (failing === "access_roles") return;
      script("access_role_assignments", { error: { message: "down" } });
    };
    scriptAll();
    await expect(holdsAdminGrantOrRaise("owner@example.com")).rejects.toBeInstanceOf(ReadFailure);
    scriptAll();
    expect(await holdsAdminGrant("owner@example.com")).toBe(false);
    log.mockRestore();
  });
});

describe("liveGrantCount", () => {
  it("counts the live grants of the role", async () => {
    script("access_roles", { data: [{ id: "r-super" }] });
    script("access_role_assignments", { count: 2 });
    expect(await liveGrantCount("super-admin")).toBe(2);
  });

  it("answers zero for a role that is missing or archived", async () => {
    script("access_roles", { data: [] });
    expect(await liveGrantCount("admin")).toBe(0);
  });

  it("raises on a failed read rather than answering zero", async () => {
    script("access_roles", { error: { message: "down" } });
    await expect(liveGrantCount("admin")).rejects.toThrow(/down/);
    script("access_roles", { data: [{ id: "r-admin" }] });
    script("access_role_assignments", { error: { message: "boom" } });
    await expect(liveGrantCount("admin")).rejects.toThrow(/boom/);
  });
});

describe("personIdsByEmail", () => {
  it("answers every person row with the email, the B.28 duplicate included", async () => {
    script("people", { data: [{ id: "p-1" }, { id: "p-2" }] });
    expect(await personIdsByEmail("Lan@Example.com")).toEqual(["p-1", "p-2"]);
  });

  it("raises on a failed read rather than answering nobody", async () => {
    script("people", { error: { message: "boom" } });
    await expect(personIdsByEmail("lan@example.com")).rejects.toThrow(/boom/);
  });
});

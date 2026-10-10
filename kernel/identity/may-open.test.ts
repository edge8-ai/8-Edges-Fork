import { beforeEach, describe, expect, it, vi } from "vitest";

// The three ways a sender asks whether a recipient may open a page (AC.15, ADR
// 0013): by person, by the email address a DM or an email is sent to, and for a
// list of addresses at once. The registers are mocked; the decision is the
// kernel's own (mayOpenPath over the registered routes).
const held = vi.hoisted(() => new Map<string, string[]>());
const people = vi.hoisted(() => new Map<string, string>());
vi.mock("@/kernel/identity/access-of-person", () => ({
  accessOf: vi.fn(async (personId: string) => {
    const permissions = held.get(personId);
    return permissions ? { roles: [], permissions: () => permissions, may: (p: string) => permissions.includes(p) } : null;
  }),
}));
vi.mock("@/kernel/identity/person-by-email", () => ({
  personIdForEmail: vi.fn(async (email: string | null | undefined) => (email ? people.get(email) ?? null : null)),
}));

import { registerPermissionRegistry } from "./permission-registry";
import { emailsWhoMayOpen, recipientMayOpen, recipientMayOpenByEmail } from "./may-open";

registerPermissionRegistry({
  atoms: {},
  routes: { "/team/boards/[slug]": "surface.team", "/admin/talent/team/[id]": "org.people", "/team/login": "public" },
  actions: {},
  implies: {},
  roles: {},
});

beforeEach(() => {
  held.clear();
  people.clear();
  held.set("p-ben", ["surface.team"]);
  held.set("p-lan", ["surface.team", "org.people"]);
  people.set("ben@example.test", "p-ben");
  people.set("lan@example.test", "p-lan");
});

describe("recipientMayOpen", () => {
  it("is true for a page the person's permission reaches, false for one it does not", async () => {
    const may = await recipientMayOpen("p-ben");
    expect(may("/team/boards/engineering")).toBe(true);
    expect(may("https://site.test/team/boards/engineering?card=x")).toBe(true);
    expect(may("/admin/talent/team/tm-1")).toBe(false);
  });

  it("is closed by default: a page no declaration names, and no link at all", async () => {
    const may = await recipientMayOpen("p-lan");
    expect(may("/team/undeclared")).toBe(false);
    expect(may(null)).toBe(false);
  });

  it("opens nothing for a person the registers do not know", async () => {
    expect((await recipientMayOpen("p-nobody"))("/team/login")).toBe(false);
  });
});

describe("recipientMayOpenByEmail", () => {
  it("maps the address to its person", async () => {
    expect((await recipientMayOpenByEmail("lan@example.test"))("/admin/talent/team/tm-1")).toBe(true);
    expect((await recipientMayOpenByEmail("ben@example.test"))("/admin/talent/team/tm-1")).toBe(false);
  });

  it("opens nothing for an address no person holds, or none at all", async () => {
    expect((await recipientMayOpenByEmail("stranger@example.test"))("/team/boards/a")).toBe(false);
    expect((await recipientMayOpenByEmail(null))("/team/boards/a")).toBe(false);
  });
});

describe("emailsWhoMayOpen", () => {
  it("keeps, in order, the addresses whose person may open every page", async () => {
    expect(await emailsWhoMayOpen(["ben@example.test", "lan@example.test"], ["/admin/talent/team/tm-1"])).toEqual(["lan@example.test"]);
    expect(await emailsWhoMayOpen(["ben@example.test", "lan@example.test"], ["/team/boards/a"])).toEqual(["ben@example.test", "lan@example.test"]);
  });

  it("is empty when nobody may, and drops an address that is no person's", async () => {
    expect(await emailsWhoMayOpen(["ben@example.test", "stranger@example.test"], ["/admin/talent/team/tm-1"])).toEqual([]);
  });
});

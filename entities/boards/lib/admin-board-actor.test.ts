import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// W.144: an admin signed in through the admin login was named by their email
// on every comment, "Resolved by" and audit row, with no person id at all.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/entities/contacts", () => ({ selectStaffAssignments: vi.fn() }));
let held: string[] = [];
vi.mock("@/kernel/identity/access-request", () => ({
  getAccess: async () => ({ user: { id: "u1", email: "ada@example.com" }, may: (p: string) => held.includes(p) }),
}));
vi.mock("@/kernel/identity/team-auth", () => ({ getTeamActor: async () => ({ actor: null }) }));

const { adminBoardActor, boardActorFor } = await import("./access");

beforeEach(() => {
  resetFake();
  held = [];
});

describe("adminBoardActor", () => {
  it("names the admin by the name the board shows, and carries their person id", async () => {
    script("people", { data: { id: "p1", display_name: "Ada Rivers", preferred_name: null, full_name: "Ada Maria Rivers", email: "ada@example.com" } });
    expect(await adminBoardActor("Ada@Example.com")).toEqual({ label: "Ada Rivers", personId: "p1", isAdmin: true });
  });

  it("keeps the email and no id when nobody has that email", async () => {
    script("people", { data: null });
    expect(await adminBoardActor("admin@example.com")).toEqual({ label: "admin@example.com", personId: null, isAdmin: true });
  });

  it("keeps the email when the read fails, so a write never fails over a name", async () => {
    script("people", { error: { message: "people unavailable" } });
    expect(await adminBoardActor("admin@example.com")).toEqual({ label: "admin@example.com", personId: null, isAdmin: true });
  });

  it("matches the address literally: an underscore is not a wildcard", async () => {
    script("people", { data: null });
    await adminBoardActor("first_last@example.com");
    const read = calls.find((c) => c.table === "people");
    expect(read?.filters).toContainEqual(["ilike", "email", "first\\_last@example.com"]);
  });
});

// AE.3: the Workboard's admin scope is boards.admin, not entering the Admin view.
describe("boardActorFor", () => {
  it("acts as the board's admin for whoever holds boards.admin", async () => {
    held = ["surface.admin", "boards.open", "boards.admin"];
    script("people", { data: { id: "p1", display_name: "Ada Rivers", preferred_name: null, full_name: null, email: "ada@example.com" } });
    expect(await boardActorFor("b1")).toEqual({ label: "Ada Rivers", personId: "p1", isAdmin: true });
  });

  it("gives an Accountant (surface.admin and boards.open, no boards.admin) no admin scope", async () => {
    held = ["surface.admin", "boards.open"];
    expect(await boardActorFor("b1")).toBeNull();
  });
});

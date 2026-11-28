import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
// The grant register (AC.20) answers who is an admin; until A.56 this read
// company_os.admins. Faked by email for most cases here; with `register.real`
// set, a case runs the real register over the fake tables, so the failure
// path is the one production takes rather than a stand-in for it.
const { adminEmails, holdsAdminGrantOrRaise, register } = vi.hoisted(() => {
  const adminEmails = new Set<string>();
  return { adminEmails, holdsAdminGrantOrRaise: vi.fn(async (email: string) => adminEmails.has(email)), register: { real: false } };
});
vi.mock("@/kernel/identity/admin-register", async () => {
  const actual = await vi.importActual<typeof import("@/kernel/identity/admin-register")>("@/kernel/identity/admin-register");
  return {
    holdsAdminGrantOrRaise: (email: string) => (register.real ? actual.holdsAdminGrantOrRaise(email) : holdsAdminGrantOrRaise(email)),
  };
});

import { STAFF_UPLOADER, uploaderLabel, uploaderLabels } from "./uploader-label";
import { portalDocumentRows } from "./document-rows";

// S.16.21 and S.16.24. A client reads who uploaded a document; never an
// email address, and never a staffer's personal name.

beforeEach(() => {
  resetFake();
  adminEmails.clear();
  holdsAdminGrantOrRaise.mockClear();
  register.real = false;
});

describe("uploaderLabel", () => {
  it("says Edge8 for a staff upload, whoever it was", () => {
    expect(uploaderLabel({ staff: true, display_name: "Linh Tran" })).toBe(STAFF_UPLOADER);
  });

  it("names a client contact by name", () => {
    expect(uploaderLabel({ staff: false, display_name: "Sam Lee" })).toBe("Sam Lee");
  });

  it("says nothing for an unnamed uploader, and never falls back to the address", () => {
    const unnamed = { staff: false, display_name: null, preferred_name: null, full_name: null, email: "someone@client.example" };
    expect(uploaderLabel(unnamed)).toBeNull();
    expect(uploaderLabel(undefined)).toBeNull();
  });
});

describe("uploaderLabels", () => {
  it("finds an uploader whose stored email has capitals (the production failure)", async () => {
    script("people", {
      data: [
        { id: "p-sam", email: "Sam.Lee@Client.Example", display_name: "Sam Lee" },
        // What ilike's `_` wildcard can drag in: not in the list, so dropped.
        { id: "p-other", email: "samXlee@client.example", display_name: "Someone Else" },
      ],
    });
    script("team_members", { data: [] });
    const labels = await uploaderLabels(["sam.lee@client.example"]);
    expect(labels.get("sam.lee@client.example")).toBe("Sam Lee");
    expect(labels.size).toBe(1);
    // The people read matches case-insensitively, never with a case-sensitive `in`.
    const people = calls.find((c) => c.table === "people")!;
    expect(people.filters).toEqual([["or", 'email.ilike."sam.lee@client.example"']]);
  });

  it("says Edge8 for a former staffer whose /team access was revoked", async () => {
    script("people", { data: [{ id: "p-old", email: "old@edge.example", display_name: "Old Staffer" }] });
    // Still has a team_members row, whatever its status; is_team_member is not read.
    script("team_members", { data: [{ person_id: "p-old" }] });
    const labels = await uploaderLabels(["old@edge.example"]);
    expect(labels.get("old@edge.example")).toBe(STAFF_UPLOADER);
  });

  it("says Edge8 for an admin, even one with no people row", async () => {
    script("people", { data: [] });
    adminEmails.add("boss@edge.example");
    const labels = await uploaderLabels(["Boss@Edge.example"]);
    expect(labels.get("boss@edge.example")).toBe(STAFF_UPLOADER);
    // The register is asked with the lower-cased address; nothing reads the retired admins table.
    expect(holdsAdminGrantOrRaise).toHaveBeenCalledWith("boss@edge.example");
    expect(calls.some((c) => c.table === "admins")).toBe(false);
  });

  it("says Edge8 for an admin grant holder with a people row and no team_members row", async () => {
    script("people", { data: [{ id: "p-boss", email: "Boss@Edge.example", display_name: "The Boss" }] });
    script("team_members", { data: [] });
    adminEmails.add("boss@edge.example");
    const labels = await uploaderLabels(["boss@edge.example"]);
    expect(labels.get("boss@edge.example")).toBe(STAFF_UPLOADER);
  });

  it("names nobody when the admin check cannot be made", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    script("people", { data: [{ id: "p-sam", email: "sam@client.example", display_name: "Sam Lee" }] });
    holdsAdminGrantOrRaise.mockRejectedValueOnce(new Error("read failed: grant count"));
    expect((await uploaderLabels(["sam@client.example"])).size).toBe(0);
    log.mockRestore();
  });

  it.each(["access_roles", "access_role_assignments"])(
    "names nobody, never the admin by name, when the register's %s read fails",
    async (failing) => {
      // The real register: an admin with a people row and no team_members row
      // whose grant cannot be read. Answered "no grant", this would put "The
      // Boss" on a client's screen; the label names nobody, as before A.56.
      register.real = true;
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      script("people", { data: [{ id: "p-boss", email: "boss@edge.example", display_name: "The Boss" }] }, { data: [{ id: "p-boss", email: "boss@edge.example" }] });
      script("team_members", { data: [] });
      if (failing === "access_roles") script("access_roles", { error: { message: "read timeout" } });
      else {
        script("access_roles", { data: [{ id: "r-admin", key: "admin" }] });
        script("access_role_assignments", { error: { message: "read timeout" } });
      }
      const labels = await uploaderLabels(["boss@edge.example"]);
      expect(labels.size).toBe(0);
      expect([...labels.values()]).not.toContain("The Boss");
      log.mockRestore();
    },
  );

  it("says Edge8 through the real register when the grant reads succeed", async () => {
    register.real = true;
    script("people", { data: [{ id: "p-boss", email: "boss@edge.example", display_name: "The Boss" }] }, { data: [{ id: "p-boss", email: "boss@edge.example" }] });
    script("team_members", { data: [] });
    script("access_roles", { data: [{ id: "r-admin", key: "admin" }] });
    script("access_role_assignments", { data: [{ role_id: "r-admin" }] });
    expect((await uploaderLabels(["boss@edge.example"])).get("boss@edge.example")).toBe(STAFF_UPLOADER);
  });

  it("returns no address for an unnamed client uploader", async () => {
    script("people", { data: [{ id: "p-x", email: "nameless@client.example", display_name: null, preferred_name: null, full_name: null }] });
    script("team_members", { data: [] });
    const labels = await uploaderLabels(["nameless@client.example", null]);
    expect(labels.size).toBe(0);
  });

  it("names nobody when any read fails, so a staffer never shows under a personal name", async () => {
    script("people", { data: [{ id: "p-old", email: "old@edge.example", display_name: "Old Staffer" }] });
    script("team_members", { error: { message: "read timeout" } });
    expect((await uploaderLabels(["old@edge.example"])).size).toBe(0);
  });
});

describe("portalDocumentRows", () => {
  it("sends the browser the label and isMine, never the uploader's email", () => {
    const rows = portalDocumentRows(
      [
        { id: "d1", filename: "a.pdf", sizeBytes: 1, uploadedBy: "Viewer@Client.Example", uploaderName: "Sam Lee", createdAt: "2026-09-20" },
        { id: "d2", filename: "b.pdf", sizeBytes: 1, uploadedBy: "staff@edge.example", uploaderName: "Edge8", createdAt: "2026-09-20" },
      ],
      "viewer@client.example",
    );
    expect(rows.map((r) => r.isMine)).toEqual([true, false]);
    expect(JSON.stringify(rows)).not.toContain("@");
  });
});

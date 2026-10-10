import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

vi.mock("@/kernel/data/supabase", () => fakeSupabase());

import { STAFF_UPLOADER, uploaderLabel, uploaderLabels } from "./uploader-label";
import { emailsFilter } from "@/entities/client-programs";
import { portalDocumentRows } from "./document-rows";

// S.16.21 and S.16.24. A client reads who uploaded a document; never an
// email address, and never a staffer's personal name.

beforeEach(() => resetFake());

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
    script("admins", { data: [] });
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
    script("admins", { data: [] });
    // Still has a team_members row, whatever its status; is_team_member is not read.
    script("team_members", { data: [{ person_id: "p-old" }] });
    const labels = await uploaderLabels(["old@edge.example"]);
    expect(labels.get("old@edge.example")).toBe(STAFF_UPLOADER);
  });

  it("says Edge8 for an admin, even one with no people row", async () => {
    script("people", { data: [] });
    script("admins", { data: [{ email: "boss@edge.example", person_id: null }] });
    const labels = await uploaderLabels(["Boss@Edge.example"]);
    expect(labels.get("boss@edge.example")).toBe(STAFF_UPLOADER);
  });

  it("returns no address for an unnamed client uploader", async () => {
    script("people", { data: [{ id: "p-x", email: "nameless@client.example", display_name: null, preferred_name: null, full_name: null }] });
    script("admins", { data: [] });
    script("team_members", { data: [] });
    const labels = await uploaderLabels(["nameless@client.example", null]);
    expect(labels.size).toBe(0);
  });

  it("names nobody when any read fails, so a staffer never shows under a personal name", async () => {
    script("people", { data: [{ id: "p-old", email: "old@edge.example", display_name: "Old Staffer" }] });
    script("admins", { data: [] });
    script("team_members", { error: { message: "read timeout" } });
    expect((await uploaderLabels(["old@edge.example"])).size).toBe(0);
  });
});

describe("emailsFilter", () => {
  it("builds one ilike per email, quoted, with quotes and backslashes removed", () => {
    expect(emailsFilter("email", ["a@b.example", 'x"y@b.example'])).toBe('email.ilike."a@b.example",email.ilike."xy@b.example"');
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

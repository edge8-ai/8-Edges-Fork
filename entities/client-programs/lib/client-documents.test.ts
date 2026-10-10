import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// W.118.6. A program document link is drawn as "Open" in the client portal, the
// team hub and the CRM, so it is stored only as externalHref writes it.
vi.mock("@/kernel/data/supabase", () => ({ supabase: {}, companyOs: { from: (table: string) => builderFor(table) } }));

import { listDocumentsForCompanies, recordLink } from "./client-documents";

beforeEach(() => {
  resetFake();
});

describe("recordLink", () => {
  it("stores a schemeless link as https, titled by its host when untitled", async () => {
    script("program_documents", {});
    expect(await recordLink({ companyId: "c1", url: "docs.google.com/d/abc", uploadedBy: "a@example.test" })).toEqual({ ok: true });
    expect(calls.map((c) => c.payloads[0])).toEqual([expect.objectContaining({ url: "https://docs.google.com/d/abc", filename: "docs.google.com" })]);
  });

  it("refuses a value that is not a web link, and writes nothing", async () => {
    for (const bad of ["javascript:alert(1)", "shared drive", "localhost:3000"]) {
      expect(await recordLink({ companyId: "c1", url: bad, uploadedBy: "a@example.test" })).toEqual({
        ok: false,
        error: "Enter a valid http(s) link.",
      });
    }
    expect(calls).toHaveLength(0);
  });
});

// The uploader's name reaches the client portal. The email is the lookup key,
// never the name: a nameless uploader gets no uploaderName (S.16.13 review).
describe("listDocumentsForCompanies — the uploader's name", () => {
  beforeEach(() => resetFake());

  it("is the display name, and null for an uploader with no name", async () => {
    script("program_documents", {
      data: [
        { id: "d1", company_id: "c1", filename: "a.pdf", uploaded_by: "Lan@Example.test", created_at: "2026-09-01" },
        { id: "d2", company_id: "c1", filename: "b.pdf", uploaded_by: "anon@example.test", created_at: "2026-09-01" },
      ],
    });
    script("people", {
      data: [
        { display_name: "Lan Trần", full_name: "Trần Thị Lan", email: "lan@example.test" },
        { display_name: null, preferred_name: null, full_name: null, email: "anon@example.test" },
      ],
    });
    const docs = await listDocumentsForCompanies(["c1"]);
    expect(docs.map((d) => d.uploaderName)).toEqual(["Lan Trần", null]);
  });

  // S.16.24: people.email keeps its capitals, and `.in()` is case-sensitive,
  // so half of production's documents lost their uploader.
  it("finds an uploader whose stored email has capitals, matching case-insensitively", async () => {
    script("program_documents", {
      data: [{ id: "d1", company_id: "c1", filename: "a.pdf", uploaded_by: "sam.lee@client.example", created_at: "2026-09-01" }],
    });
    script("people", {
      data: [
        { display_name: "Sam Lee", email: "Sam.Lee@Client.Example" },
        // An ilike wildcard match not asked for is dropped.
        { display_name: "Someone Else", email: "samXlee@client.example" },
      ],
    });
    const docs = await listDocumentsForCompanies(["c1"]);
    expect(docs.map((d) => d.uploaderName)).toEqual(["Sam Lee"]);
    const people = calls.find((c) => c.table === "people")!;
    expect(people.filters).toEqual([["or", 'email.ilike."sam.lee@client.example"']]);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// W.118.1. A client edits their own LinkedIn in the portal, and Edge8 staff see
// it as an href on the contact views: a value that is not a link is refused.
// W.124. The company website is the same kind of field, drawn as an href on the
// CRM company page, and is read the same way.
// S.17, S.18. companies.metadata is shared with Edge8 (QuickBooks customer ids,
// research links). The company save sends only the three keys it owns and the
// database merges them into the row as stored, so the portal never writes the
// metadata column itself and has no read of it to get wrong.
//
// Table writes go through the house fake. The merge is a database function
// rather than a table, so it is faked where it is exported, as a recorder with
// a response each test can set.
type Rpc = { data: boolean | null; error: { message: string } | null };
let mergeResponse: Rpc = { data: true, error: null };
const metadataMerges: Array<{ companyId: string; patch: Record<string, unknown> }> = [];
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));
vi.mock("@/kernel/identity/reads", () => ({ selectCompanies: vi.fn() }));
vi.mock("@/entities/contacts", () => ({ selectPersonCompanies: vi.fn(), updatePersonCompanies: vi.fn() }));
vi.mock("@/entities/portal/lib/roles", () => ({ isPortalAdmin: () => true, ROLE_DENIED: "denied" }));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/kernel/identity/writes", () => ({
  mergeCompanyMetadata: async (companyId: string, patch: Record<string, unknown>) => {
    metadataMerges.push({ companyId, patch });
    return mergeResponse;
  },
  updateCompanies: (row: unknown) => builderFor("companies").update(row),
  updatePeople: (row: unknown) => builderFor("people").update(row),
}));

import { updateCompanyProfile, updatePersonalProfile, type CompanyProfile, type PersonalProfile } from "./profile";
import type { PortalActor } from "@/kernel/identity/portal-auth";
import { LINKEDIN_NOT_A_LINK } from "@/kernel/ui/url";

// No company in scope, so the job-title write (another table) is skipped.
const actor = { personId: "p1", companyScope: [] } as unknown as PortalActor;
const profile = (linkedinUrl: string): PersonalProfile => ({
  fullName: "Someone",
  preferredName: "",
  phone: "",
  jobTitle: "",
  city: "",
  stateProvince: "",
  country: "",
  timezone: "",
  linkedinUrl,
});

const company = (websiteUrl: string): CompanyProfile => ({
  name: "Acme",
  industry: "",
  sizeBand: "",
  country: "",
  websiteUrl,
  headOffice: "",
  generalEmail: "",
  registrationNumber: "",
  billingAddress: "",
});

const writesTo = (table: string) =>
  calls.filter((c) => c.table === table && c.ops.includes("update")).map((c) => c.payloads[0] as Record<string, unknown>);

beforeEach(() => {
  resetFake();
  metadataMerges.length = 0;
  mergeResponse = { data: true, error: null };
});

describe("updatePersonalProfile · LinkedIn", () => {
  it("stores a schemeless profile as https on the actor's own row, and clears on empty", async () => {
    script("people", {}, {});
    expect(await updatePersonalProfile(actor, profile("linkedin.com/in/someone"))).toEqual({ ok: true });
    expect(await updatePersonalProfile(actor, profile(""))).toEqual({ ok: true });
    expect(calls.map((c) => [(c.payloads[0] as Record<string, unknown>).linkedin_url, c.filters])).toEqual([
      ["https://linkedin.com/in/someone", [["eq", "id", "p1"]]],
      [null, [["eq", "id", "p1"]]],
    ]);
  });

  it("refuses a value that is not a link and writes nothing", async () => {
    expect(await updatePersonalProfile(actor, profile("javascript:alert(1)"))).toEqual({
      ok: false,
      error: LINKEDIN_NOT_A_LINK,
    });
    expect(calls).toHaveLength(0);
  });
});

describe("updateCompanyProfile · website", () => {
  it("stores a schemeless website as https, and clears on empty", async () => {
    script("companies", {}, {});
    expect(await updateCompanyProfile(actor, "c1", company("acme.com"))).toEqual({ ok: true });
    expect(await updateCompanyProfile(actor, "c1", company("  "))).toEqual({ ok: true });
    expect(writesTo("companies").map((w) => w.website_url)).toEqual(["https://acme.com/", null]);
  });

  it("refuses a value that is not a link and touches nothing", async () => {
    for (const bad of ["javascript:alert(1)", "acme"]) {
      expect(await updateCompanyProfile(actor, "c1", company(bad))).toEqual({
        ok: false,
        error: "The website isn't a web link. Enter the company's address (e.g. acme.com).",
      });
    }
    expect(metadataMerges).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });
});

describe("updateCompanyProfile · shared metadata", () => {
  const withKeys: CompanyProfile = {
    ...company("acme.com"),
    headOffice: "Sydney",
    generalEmail: "hello@acme.example",
    registrationNumber: "12 345 678 901",
  };

  it("sends only its three keys to the merge, and never writes the metadata column", async () => {
    script("companies", {});
    expect(await updateCompanyProfile(actor, "c1", withKeys)).toEqual({ ok: true });
    expect(metadataMerges).toEqual([
      { companyId: "c1", patch: { head_office: "Sydney", general_email: "hello@acme.example", abn: "12 345 678 901" } },
    ]);
    expect(writesTo("companies")).toHaveLength(1);
    expect(writesTo("companies")[0]).not.toHaveProperty("metadata");
    expect(calls[0].filters).toEqual([["eq", "id", "c1"]]);
  });

  it("refuses the save and writes no columns when the merge fails or finds no company", async () => {
    for (const response of [
      { data: null, error: { message: "connection reset" } },
      { data: false, error: null },
    ]) {
      mergeResponse = response;
      expect(await updateCompanyProfile(actor, "c1", withKeys)).toEqual({
        ok: false,
        error: "Could not save the company details.",
      });
    }
    expect(calls).toHaveLength(0);
  });
});

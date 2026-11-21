import { beforeEach, describe, expect, it, vi } from "vitest";

// W.124. A company's website is drawn as an href on the company page, and is
// written here by the admin details form and by the client's own portal form: a
// value that is not a link is refused, never stored, and never clears the one
// already saved.
const writes: Record<string, unknown>[] = [];
vi.mock("@/kernel/shell/surface", () => ({ revalidateSurfaces: vi.fn() }));
vi.mock("@/kernel/data/supabase", () => ({ companyOs: {} }));
// The action asks for its declared permission (ADR 0013); recorded so the test pins which one.
const asked: string[] = [];
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async (p: string) => {
    asked.push(p);
    return { user: { email: "admin@example.test" } };
  },
}));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => {}) }));
vi.mock("@/entities/crm/lib/mutations", () => ({ archiveRecord: vi.fn(), guardedDelete: vi.fn(), restoreRecord: vi.fn() }));
vi.mock("@/kernel/identity/writes", () => ({
  updateCompanies: (patch: Record<string, unknown>) => {
    writes.push(patch);
    return { eq: async () => ({ error: null }) };
  },
}));

import { updateCompany } from "./companies-actions";

beforeEach(() => {
  writes.length = 0;
  asked.length = 0;
});

describe("company actions · access", () => {
  it("asks for crm.pipeline before writing", async () => {
    await updateCompany("c1", { country: "Vietnam" });
    expect(asked[0]).toBe("crm.pipeline");
  });
});

describe("updateCompany · client day", () => {
  it("writes a valid zone and start, and clears both on empty", async () => {
    await updateCompany("c1", { time_zone: "Australia/Melbourne", working_day_start: "08:30" });
    await updateCompany("c1", { time_zone: "", working_day_start: "" });
    expect(writes[0]).toMatchObject({ time_zone: "Australia/Melbourne", working_day_start: "08:30" });
    expect(writes[1]).toMatchObject({ time_zone: null, working_day_start: null });
  });

  it("refuses a bad zone and a start without a zone, writing nothing", async () => {
    expect((await updateCompany("c1", { time_zone: "Mars/Olympus" })).ok).toBe(false);
    expect(await updateCompany("c1", { time_zone: "", working_day_start: "09:00" })).toEqual({
      ok: false,
      error: "Set a time zone before a working-day start: the start is a time in that zone.",
    });
    expect(writes).toHaveLength(0);
  });

  it("leaves both columns alone when the patch does not name them", async () => {
    await updateCompany("c1", { country: "Vietnam" });
    expect("time_zone" in writes[0]).toBe(false);
    expect("working_day_start" in writes[0]).toBe(false);
  });
});

describe("updateCompany · website", () => {
  it("stores a schemeless website as https, and clears on empty", async () => {
    expect(await updateCompany("c1", { website_url: "acme.com" })).toEqual({ ok: true });
    expect(await updateCompany("c1", { website_url: "  " })).toEqual({ ok: true });
    expect(writes.map((w) => w.website_url)).toEqual(["https://acme.com/", null]);
  });

  it("refuses a value that is not a link and writes nothing", async () => {
    for (const bad of ["javascript:alert(1)", "acme"]) {
      expect(await updateCompany("c1", { website_url: bad, country: "Vietnam" })).toEqual({
        ok: false,
        error: "The website isn't a web link. Enter the company's address (e.g. acme.com).",
      });
    }
    expect(writes).toHaveLength(0);
  });

  it("leaves the website alone when the patch does not name it", async () => {
    expect(await updateCompany("c1", { country: "Vietnam" })).toEqual({ ok: true });
    expect(writes).toHaveLength(1);
    expect("website_url" in writes[0]).toBe(false);
  });
});

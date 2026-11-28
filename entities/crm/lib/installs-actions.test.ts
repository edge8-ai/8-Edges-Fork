import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The three promises installs-actions.ts makes in its comments, proved: a
// business address decides the company by its domain alone (a client's name
// typed beside it is never matched); an archived person is refused, not
// revived; a company matched by name alone files the install but links
// nobody, since a contact link is what an affiliate's portal access builds on;
// and every person, company and link it creates leaves one audit row.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async () => ({ user: { email: "ivins@example.test" }, personId: "actor" }),
}));
vi.mock("@/kernel/shell/surface", () => ({ revalidateSurfaces: () => {} }));
const audit = vi.hoisted(() => vi.fn(async (_row: { table: string }) => {}));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: audit }));
const byHost = vi.hoisted(() => vi.fn());
const mergeMeta = vi.hoisted(() => vi.fn(async () => ({ data: true, error: null })));
vi.mock("@/kernel/identity/writes", () => ({
  insertPeople: (row: unknown) => builderFor("people").insert(row),
  insertCompanies: (row: unknown) => builderFor("companies").insert(row),
  findOrCreateCompanyByHost: byHost,
  mergeCompanyMetadata: mergeMeta,
}));
const link = vi.hoisted(() => vi.fn(async () => ({ error: null })));
vi.mock("@/entities/contacts", () => ({
  personCompanyLinkIds: () => builderFor("person_companies").select("id"),
  linkPersonToCompanyOnce: link,
}));

import { recordEightEdgesInstall } from "./installs-actions";

const fields = {
  contactName: "Jo Smith",
  email: "jo@acme.example",
  companyName: "Big Client Pty Ltd",
  downloadedOn: "2026-11-16",
  source: "website",
  status: "downloaded",
} as const;

const audited = () => audit.mock.calls.map((c) => c[0].table);

beforeEach(() => {
  resetFake();
  audit.mockClear();
  byHost.mockReset();
  mergeMeta.mockClear();
  link.mockClear();
});

describe("recording an Eight Edges install", () => {
  it("files a business address under its domain's company and never matches the typed name", async () => {
    script("people", { data: [{ id: "jo", archived_at: null }] });
    byHost.mockResolvedValue({ data: [{ company_id: "acme", created: false }], error: null });
    script("person_companies", { data: [] });
    script("eight_edges_installs", { data: { id: "ins" } });

    expect(await recordEightEdgesInstall(fields)).toMatchObject({ ok: true });
    expect(byHost).toHaveBeenCalledWith("acme.example", "Big Client Pty Ltd", true);
    // No name lookup ran: the only companies query would be the name match.
    expect(calls.filter((c) => c.table === "companies")).toHaveLength(0);
    expect(link).toHaveBeenCalledWith("jo", "acme", false);
    expect(audited()).toEqual(["person_companies", "eight_edges_installs"]);
  });

  it("refuses an archived person and writes nothing", async () => {
    script("people", { data: [{ id: "gone", archived_at: "2026-10-01T00:00:00Z" }] });

    const r = await recordEightEdgesInstall(fields);
    expect(r).toMatchObject({ ok: false });
    expect(byHost).not.toHaveBeenCalled();
    expect(link).not.toHaveBeenCalled();
    expect(calls.some((c) => c.table === "eight_edges_installs")).toBe(false);
    expect(audit).not.toHaveBeenCalled();
  });

  it("creates the company when a free-mail name matches two, and audits each new row once", async () => {
    script("people", { data: [] }, { data: { id: "new-person" } });
    script("companies", { data: [{ id: "a", name: "Acme" }, { id: "b", name: "acme" }] }, { data: { id: "new-co" } });
    script("person_companies", { data: [] });
    script("eight_edges_installs", { data: { id: "ins" } });

    expect(await recordEightEdgesInstall({ ...fields, email: "jo@gmail.com", companyName: "Acme" })).toMatchObject({ ok: true });
    expect(byHost).not.toHaveBeenCalled();
    expect(link).toHaveBeenCalledWith("new-person", "new-co", false);
    expect(audited()).toEqual(["people", "companies", "person_companies", "eight_edges_installs"]);
  });

  it("audits and relabels a company the host function creates", async () => {
    script("people", { data: [{ id: "jo", archived_at: null }] });
    byHost.mockResolvedValue({ data: [{ company_id: "made", created: true }], error: null });
    script("person_companies", { data: [] });
    script("eight_edges_installs", { data: { id: "ins" } });

    expect(await recordEightEdgesInstall(fields)).toMatchObject({ ok: true });
    expect(mergeMeta).toHaveBeenCalledWith("made", { created_by: "eight-edges-installs" });
    expect(audited()).toEqual(["companies", "person_companies", "eight_edges_installs"]);
  });

  it("does not link or audit a link that already exists", async () => {
    script("people", { data: [{ id: "jo", archived_at: null }] });
    byHost.mockResolvedValue({ data: [{ company_id: "acme", created: false }], error: null });
    script("person_companies", { data: [{ id: "existing" }] });
    script("eight_edges_installs", { data: { id: "ins" } });

    expect(await recordEightEdgesInstall(fields)).toMatchObject({ ok: true });
    expect(link).not.toHaveBeenCalled();
    expect(audited()).toEqual(["eight_edges_installs"]);
  });

  it("files a free-mail install under a unique name match without linking the contact to it", async () => {
    script("people", { data: [{ id: "jo", archived_at: null }] });
    script("companies", { data: [{ id: "client", name: "Big Client Pty Ltd" }] });
    script("eight_edges_installs", { data: { id: "ins" } });

    const r = await recordEightEdgesInstall({ ...fields, email: "jo@gmail.com" });
    expect(r).toMatchObject({ ok: true, message: expect.stringContaining("not linked") });
    expect(byHost).not.toHaveBeenCalled();
    expect(link).not.toHaveBeenCalled();
    expect(calls.some((c) => c.table === "person_companies")).toBe(false);
    expect(calls.find((c) => c.table === "eight_edges_installs")?.payloads[0]).toMatchObject({ company_id: "client", person_id: "jo" });
    expect(audited()).toEqual(["eight_edges_installs"]);
  });

  it("never falls back to a name match for a business address the host lookup cannot place", async () => {
    script("people", { data: [{ id: "jo", archived_at: null }] });
    byHost.mockResolvedValue({ data: [], error: null });

    expect(await recordEightEdgesInstall(fields)).toMatchObject({ ok: false });
    expect(calls.some((c) => c.table === "companies")).toBe(false);
    expect(calls.some((c) => c.table === "eight_edges_installs")).toBe(false);
  });
});

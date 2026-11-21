import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// TR.23.4. A staffing job is hired for a client under the client's own
// manager, so the jobs drawer may name one of the client's CRM contacts as the
// hiring manager. Contacts are CRM's to show (PR #2120), so these pin that a
// contact is accepted only for that client's job and only from a viewer who
// may see client contacts, that one of our team may manage any job, that a new
// client clears the old manager, and that the recruiter is on the current team.
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));
const contacts = vi.hoisted(() => ({ contactLinkAt: vi.fn(), contactIdsOfCompanies: vi.fn() }));
vi.mock("@/entities/contacts", () => contacts);

const { contactsOfClient, jobPeopleUpdates, seatsError } = await import("./job-people");

const ACME = "11111111-1111-4111-8111-111111111111";
const GLOBEX = "22222222-2222-4222-8222-222222222222";
const OURS = "33333333-3333-4333-8333-333333333333";
const THEIRS = "44444444-4444-4444-8444-444444444444";
const RECRUITER = "55555555-5555-4555-8555-555555555555";

beforeEach(() => {
  resetFake();
  contacts.contactLinkAt.mockReset();
  contacts.contactIdsOfCompanies.mockReset();
});

describe("the client", () => {
  it("clears the hiring manager when it changes", async () => {
    script("companies", { data: { id: GLOBEX } });
    const r = await jobPeopleUpdates({ client_company_id: GLOBEX }, ACME, true);
    expect(r).toEqual({ ok: true, updates: { client_company_id: GLOBEX, hiring_manager_id: null } });
  });

  it("keeps the hiring manager when the same client is saved again", async () => {
    script("companies", { data: { id: ACME } });
    const r = await jobPeopleUpdates({ client_company_id: ACME }, ACME, true);
    expect(r).toEqual({ ok: true, updates: { client_company_id: ACME } });
  });

  it("refuses a company that is archived or gone", async () => {
    script("companies", { data: null });
    expect(await jobPeopleUpdates({ client_company_id: ACME }, null, true)).toEqual({
      ok: false,
      error: "That client is not an active company in CRM.",
    });
  });
});

describe("the hiring manager", () => {
  it("may be one of our team on any job, without asking CRM", async () => {
    script("team_members", { data: [{ id: "tm" }] });
    expect(await jobPeopleUpdates({ hiring_manager_id: OURS }, ACME, false)).toEqual({ ok: true, updates: { hiring_manager_id: OURS } });
    expect(contacts.contactLinkAt).not.toHaveBeenCalled();
  });

  it("may be a client's contact only on that client's job", async () => {
    script("team_members", { data: [] }, { data: [] });
    contacts.contactLinkAt.mockResolvedValueOnce({ data: null, error: null });
    expect(await jobPeopleUpdates({ hiring_manager_id: THEIRS }, ACME, true)).toEqual({
      ok: false,
      error: "That person is not one of the client's contacts in CRM.",
    });
    contacts.contactLinkAt.mockResolvedValueOnce({ data: { person_id: THEIRS }, error: null });
    expect(await jobPeopleUpdates({ hiring_manager_id: THEIRS }, ACME, true)).toEqual({ ok: true, updates: { hiring_manager_id: THEIRS } });
    expect(contacts.contactLinkAt).toHaveBeenLastCalledWith(ACME, THEIRS);
  });

  it("is checked against the client the same save sets, not the one before it", async () => {
    script("companies", { data: { id: GLOBEX } });
    script("team_members", { data: [] });
    contacts.contactLinkAt.mockResolvedValueOnce({ data: { person_id: THEIRS }, error: null });
    const r = await jobPeopleUpdates({ client_company_id: GLOBEX, hiring_manager_id: THEIRS }, ACME, true);
    expect(r).toEqual({ ok: true, updates: { client_company_id: GLOBEX, hiring_manager_id: THEIRS } });
    expect(contacts.contactLinkAt).toHaveBeenCalledWith(GLOBEX, THEIRS);
  });

  it("is never a contact from a viewer who may not see client contacts", async () => {
    script("team_members", { data: [] });
    expect(await jobPeopleUpdates({ hiring_manager_id: THEIRS }, ACME, false)).toEqual({
      ok: false,
      error: "Picking a client's contact needs access to CRM.",
    });
    expect(contacts.contactLinkAt).not.toHaveBeenCalled();
  });

  it("is one of our team on an in-house job", async () => {
    script("team_members", { data: [] });
    expect(await jobPeopleUpdates({ hiring_manager_id: THEIRS }, null, true)).toEqual({
      ok: false,
      error: "Pick the hiring manager from our team.",
    });
  });
});

describe("the recruiter", () => {
  it("is someone on the current team", async () => {
    script("team_members", { data: null }, { data: { id: RECRUITER } });
    expect(await jobPeopleUpdates({ recruiter_id: RECRUITER }, null, true)).toEqual({
      ok: false,
      error: "Pick the recruiter from the current team.",
    });
    expect(await jobPeopleUpdates({ recruiter_id: RECRUITER }, null, true)).toEqual({ ok: true, updates: { recruiter_id: RECRUITER } });
  });

  it("may be cleared", async () => {
    expect(await jobPeopleUpdates({ recruiter_id: "" }, null, true)).toEqual({ ok: true, updates: { recruiter_id: null } });
  });
});

describe("a client's contacts", () => {
  it("lists each linked person once, by first name", async () => {
    contacts.contactIdsOfCompanies.mockResolvedValueOnce({
      data: [{ person_id: THEIRS, company_id: ACME }, { person_id: OURS, company_id: ACME }, { person_id: THEIRS, company_id: ACME }],
      error: null,
    });
    script("people", {
      data: [
        { id: THEIRS, display_name: "Zoe Tran", preferred_name: null, full_name: null, email: null },
        { id: OURS, display_name: "An Le", preferred_name: null, full_name: null, email: null },
      ],
    });
    expect(await contactsOfClient(ACME)).toEqual({
      ok: true,
      contacts: [
        { id: OURS, name: "An Le" },
        { id: THEIRS, name: "Zoe Tran" },
      ],
    });
  });

  it("says so when CRM cannot be read, rather than offering nobody", async () => {
    contacts.contactIdsOfCompanies.mockResolvedValueOnce({ data: null, error: { message: "db down" } });
    expect(await contactsOfClient(ACME)).toEqual({ ok: false, error: "db down" });
  });
});

describe("seats to fill", () => {
  it("takes a whole number from 1 to 999", () => {
    expect(seatsError(1)).toBeNull();
    expect(seatsError(999)).toBeNull();
    for (const bad of [0, 1.5, 1000, Number.NaN, -1]) expect(seatsError(bad)).not.toBeNull();
  });
});

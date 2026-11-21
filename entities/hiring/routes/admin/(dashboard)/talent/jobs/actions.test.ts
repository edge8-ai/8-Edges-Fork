import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// TR.23.4. The hiring manager picker lists a client's CRM contacts, and the
// save may name one. Both ask CRM's own rule (crm's seesEveryClient) of the
// viewer, after the hiring.ats guard: a viewer who may run hiring but not see
// client contacts gets neither the list nor the save. The checks themselves are
// pinned in job-people.test.ts; these pin that the actions ask them.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: async () => {} }));
vi.mock("@/entities/hiring/lib/chain/close", () => ({ closeChainForRequisition: async () => {} }));
vi.mock("@/entities/hiring/lib/chain/run", () => ({ chainMode: async () => "shadow" }));
const guard = vi.hoisted(() => ({ requirePermission: vi.fn() }));
vi.mock("@/kernel/identity/access-request", () => guard);
const crm = vi.hoisted(() => ({ seesEveryClient: vi.fn() }));
vi.mock("@/entities/crm", () => crm);
// The real job-people module is loaded for seatsError, without the contacts door behind it.
vi.mock("@/entities/contacts", () => ({}));
const people = vi.hoisted(() => ({ contactsOfClient: vi.fn(), jobPeopleUpdates: vi.fn() }));
vi.mock("./job-people", async (importActual) => ({ ...(await importActual<typeof import("./job-people")>()), ...people }));

const { listClientContacts, updateJobReq } = await import("./actions");

const ACME = "11111111-1111-4111-8111-111111111111";
const THEIRS = "44444444-4444-4444-8444-444444444444";
const ACCESS = { user: { email: "hr@example.com" }, personId: "hr", may: () => true };

beforeEach(() => {
  resetFake();
  vi.clearAllMocks();
  guard.requirePermission.mockResolvedValue(ACCESS);
});

describe("listClientContacts", () => {
  it("asks hiring.ats, then refuses a viewer who may not see client contacts without reading CRM", async () => {
    crm.seesEveryClient.mockReturnValue(false);
    expect(await listClientContacts(ACME)).toEqual({ ok: false, error: "Picking a client's contact needs access to CRM." });
    expect(guard.requirePermission).toHaveBeenCalledWith("hiring.ats");
    expect(crm.seesEveryClient).toHaveBeenCalledWith(ACCESS);
    expect(people.contactsOfClient).not.toHaveBeenCalled();
  });

  it("lists the client's contacts for a viewer who may see them", async () => {
    crm.seesEveryClient.mockReturnValue(true);
    people.contactsOfClient.mockResolvedValue({ ok: true, contacts: [] });
    expect(await listClientContacts(ACME)).toEqual({ ok: true, contacts: [] });
    expect(people.contactsOfClient).toHaveBeenCalledWith(ACME);
  });
});

describe("updateJobReq", () => {
  it("checks a new hiring manager against the job's client and the viewer's CRM access", async () => {
    crm.seesEveryClient.mockReturnValue(false);
    script("job_requisitions", { data: { client_company_id: ACME } });
    people.jobPeopleUpdates.mockResolvedValue({ ok: false, error: "Picking a client's contact needs access to CRM." });
    expect(await updateJobReq("job-1", { hiring_manager_id: THEIRS })).toEqual({
      ok: false,
      error: "Picking a client's contact needs access to CRM.",
    });
    expect(people.jobPeopleUpdates).toHaveBeenCalledWith({ hiring_manager_id: THEIRS }, ACME, false);
  });

  it("leaves who the job is for alone when the edit does not touch it", async () => {
    script("job_requisitions", { data: null });
    expect(await updateJobReq("job-1", { title: "Data engineer" })).toEqual({ ok: true });
    expect(people.jobPeopleUpdates).not.toHaveBeenCalled();
  });

  it("refuses seats that are not a whole number from 1", async () => {
    expect(await updateJobReq("job-1", { headcount: 0 })).toEqual({ ok: false, error: "Seats to fill must be a whole number from 1 to 999." });
  });
});

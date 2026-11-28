import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// TR.23.4. The hiring manager picker lists a client's CRM contacts, and the
// save may name one. Both ask CRM's own rule (crm's seesEveryClient) of the
// viewer, after the hiring.ats guard: a viewer who may run hiring but not see
// client contacts gets neither the list nor the save. The checks themselves are
// pinned in job-people.test.ts; these pin that the actions ask them.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: async () => {} }));
const chain = vi.hoisted(() => ({ closeChainForRequisition: vi.fn(async () => {}), chainMode: vi.fn(async () => "shadow") }));
vi.mock("@/entities/hiring/lib/chain/close", () => ({ closeChainForRequisition: chain.closeChainForRequisition }));
vi.mock("@/entities/hiring/lib/chain/run", () => ({ chainMode: chain.chainMode }));
// Today in Saigon, fixed so the "not after today" rule has a day to compare with.
vi.mock("@/kernel/config/dates", async (importActual) => ({
  ...(await importActual<typeof import("@/kernel/config/dates")>()),
  saigonToday: () => "2026-11-23",
}));
const guard = vi.hoisted(() => ({ requirePermission: vi.fn() }));
vi.mock("@/kernel/identity/access-request", () => guard);
const crm = vi.hoisted(() => ({ seesEveryClient: vi.fn() }));
vi.mock("@/entities/crm", () => crm);
// The real job-people module is loaded for seatsError, without the contacts door behind it.
vi.mock("@/entities/contacts", () => ({}));
const people = vi.hoisted(() => ({ contactsOfClient: vi.fn(), jobPeopleUpdates: vi.fn() }));
vi.mock("./job-people", async (importActual) => ({ ...(await importActual<typeof import("./job-people")>()), ...people }));

const { changeJobStatus, listClientContacts, updateJobDates, updateJobReq } = await import("./actions");

const ACME = "11111111-1111-4111-8111-111111111111";
const THEIRS = "44444444-4444-4444-8444-444444444444";
const ACCESS = { user: { email: "hr@example.com" }, personId: "hr", may: () => true };

beforeEach(() => {
  resetFake();
  vi.clearAllMocks();
  guard.requirePermission.mockResolvedValue(ACCESS);
  chain.chainMode.mockResolvedValue("shadow");
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

// T1.100. HR corrects a job's status and dates from its drawer. The rules are
// pinned in job-status.test.ts; these pin that the actions guard first, read
// the job before deciding, keep Close job's chain side effect, and store a
// typed day as Saigon midnight.
const writes = () => calls.filter((c) => c.ops.includes("update")).map((c) => c.payloads[0]);

describe("changeJobStatus", () => {
  it("asks hiring.ats and refuses a job it cannot read", async () => {
    script("job_requisitions", { data: null });
    expect(await changeJobStatus("job-1", "filled")).toEqual({ ok: false, error: "Job not found." });
    expect(guard.requirePermission).toHaveBeenCalledWith("hiring.ats");
  });

  it("reports a failed read as an error, not as a missing job", async () => {
    script("job_requisitions", { error: { message: "boom" } });
    expect(await changeJobStatus("job-1", "filled")).toEqual({ ok: false, error: "boom" });
  });

  it("closes an open job and ends its hiring chain, as Close job does", async () => {
    script("job_requisitions", { data: { status: "open", opened_at: "2026-10-28T17:00:00.000Z", closed_at: null } }, { data: null });
    const r = await changeJobStatus("job-1", "filled");
    expect(r).toMatchObject({ ok: true, note: "Closed is set to today. Change it if the job ended earlier." });
    expect(writes()).toEqual([expect.objectContaining({ status: "filled", closed_at: expect.any(String) })]);
    expect(chain.closeChainForRequisition).toHaveBeenCalledWith("job-1", { personId: "hr", email: "hr@example.com" });
  });

  it("sends a closed job back to Draft rather than Open while the hiring chain is live", async () => {
    chain.chainMode.mockResolvedValue("live");
    script("job_requisitions", { data: { status: "filled", opened_at: null, closed_at: "2026-11-19T17:00:00.000Z" } }, { data: null });
    expect(await changeJobStatus("job-1", "open")).toMatchObject({ ok: true });
    expect(writes()).toEqual([{ status: "draft", closed_at: null, chain_step: null }]);
    expect(chain.closeChainForRequisition).not.toHaveBeenCalled();
  });
});

describe("updateJobDates", () => {
  it("stores a typed day as midnight in Saigon, so every screen reads back the same day", async () => {
    script("job_requisitions", { data: { status: "filled", opened_at: "2026-10-28T17:00:00.000Z", closed_at: "2026-11-19T17:00:00.000Z" } }, { data: null });
    expect(await updateJobDates("job-1", { opened: "2026-10-01" })).toEqual({ ok: true });
    expect(writes()).toEqual([{ opened_at: "2026-09-30T17:00:00.000Z" }]);
  });

  it("checks the new day against the date it is not changing", async () => {
    script("job_requisitions", { data: { status: "filled", opened_at: "2026-10-28T17:00:00.000Z", closed_at: "2026-11-19T17:00:00.000Z" } });
    expect(await updateJobDates("job-1", { closed: "2026-10-28" })).toEqual({ ok: false, error: "Closed can't be before Opened." });
    expect(writes()).toEqual([]);
  });

  it("refuses a day after today in Saigon", async () => {
    script("job_requisitions", { data: { status: "open", opened_at: null, closed_at: null } });
    expect(await updateJobDates("job-1", { opened: "2026-11-24" })).toEqual({ ok: false, error: "Opened can't be after today." });
  });

  it("refuses input that is not a calendar day before reading the job", async () => {
    expect(await updateJobDates("job-1", { opened: "29/10/2026" })).toEqual({ ok: false, error: "Type the date as DD/MM/YYYY." });
    expect(calls).toEqual([]);
  });

  it("clears a date", async () => {
    script("job_requisitions", { data: { status: "filled", opened_at: "2026-10-28T17:00:00.000Z", closed_at: "2026-11-19T17:00:00.000Z" } }, { data: null });
    expect(await updateJobDates("job-1", { closed: null })).toEqual({ ok: true });
    expect(writes()).toEqual([{ closed_at: null }]);
  });
});

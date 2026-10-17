import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { builderFor, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// A contractor is named to the CLIENT on the portal request list and in the
// estimate-ready and work-ready emails. personName falls back to email last,
// so a nameless contractor read with the email column would reach the client
// as their private address; these pin that it never does (S.16.8 review,
// reproduced by the verifier). The contractor's own page greets them.

// S.5: a submission opens an approval on the kernel primitive; recorded here.
const approvalWrites: [string, Record<string, unknown>][] = [];
vi.mock("@/kernel/approvals/requests", () => ({
  openApproval: async (r: Record<string, unknown>) => (approvalWrites.push(["open", r]), { ok: true }),
  decideApproval: async (r: Record<string, unknown>) => (approvalWrites.push(["decide", r]), { ok: true }),
  cancelApproval: async (r: Record<string, unknown>) => (approvalWrites.push(["cancel", r]), { ok: true }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("notFound"); } }));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: () => "https://edge8.test" }));
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));
const sent: Record<string, unknown>[] = [];
vi.mock("@/entities/portal/lib/contractor-notify", () => ({
  pingOps: vi.fn(async () => {}),
  sendClientEstimateReadyEmail: vi.fn(async (o: Record<string, unknown>) => { sent.push(o); }),
  sendClientWorkReadyEmail: vi.fn(async (o: Record<string, unknown>) => { sent.push(o); }),
}));
vi.mock("@/entities/portal/lib/work-request-lifecycle", () => ({ moveWorkRequest: vi.fn(async () => ({ ok: true })) }));
vi.mock("./WorkForms", () => ({ EstimateForm: () => null, WorkSubmissionForm: () => null }));

import { submitEstimate, submitWork } from "./actions";
import { listActiveContractors, listWorkRequestsForActor } from "@/entities/portal/lib/client-work-requests";
import WorkRequestPage from "./page";

const nameless = { display_name: null, preferred_name: null, full_name: null, first_name: null, email: "contractor@private.test" };

beforeEach(() => {
  resetFake();
  sent.length = 0;
});

describe("a contractor named to the client", () => {
  it("is never named by email in the client's work-ready email", async () => {
    script("contractor_work_requests", {
      data: { id: "w1", title: "Deck", status: "approved", origin: "portal", people: nameless, requester: { ...nameless, email: "client@co.test" } },
    });
    expect(await submitWork({ token: "token-12345", actualHours: 2, overtimeHours: 0, summary: "Done.", link: "" })).toEqual({ ok: true });
    expect(sent[0]?.contractorName).toBeNull();
  });

  it("is never named by email in the client's estimate-ready email", async () => {
    script("contractor_work_requests", {
      data: { id: "w1", title: "Deck", status: "awaiting_estimate", origin: "portal", people: nameless, requester: { ...nameless, email: "client@co.test" } },
    });
    expect(await submitEstimate({ token: "token-12345", estimatedHours: 3, plan: "Draft, then polish." })).toEqual({ ok: true });
    expect(sent[0]?.contractorName).toBeNull();
    // The estimate now waits on the admins' list (S.5).
    expect(approvalWrites.at(-1)).toEqual(["open", expect.objectContaining({ subjectType: "contractor_estimate", approverPersonId: null })]);
  });

  it("is \"Contractor\" in the client's contractor picker, never their email (S.16.18)", async () => {
    script("team_members", { data: [{ person_id: "p1", people: nameless }] });
    expect(await listActiveContractors()).toEqual([{ personId: "p1", name: "Contractor" }]);
  });

  it("is never named by email on the portal request list", async () => {
    script("contractor_work_requests", { data: [{ id: "w1", title: "t", brief: null, status: "approved", client_company_id: "c1", people: nameless }] });
    const rows = await listWorkRequestsForActor({ companyScope: ["c1"] } as never);
    expect(rows[0].contractorName).toBeNull();
  });
});

describe("the contractor's own page", () => {
  it("greets them by the name they go by", async () => {
    script("contractor_work_requests", {
      data: {
        id: "w1", title: "Deck", brief: null, status: "requested", estimated_hours: null, plan_text: null,
        actual_hours: null, actual_overtime_hours: null, work_summary: null, work_link: null,
        people: { display_name: "Hiếu Nguyễn", preferred_name: null, full_name: "Nguyễn Văn Hiếu", first_name: null, email: "h@x.test" },
      },
    });
    script("contractor_work_events", { data: [] });
    const html = renderToStaticMarkup(await WorkRequestPage({ params: Promise.resolve({ token: "token-12345" }) }));
    expect(html).toContain("Hi Hiếu —");
    expect(html).not.toContain("Nguyễn Văn Hiếu");
  });
});

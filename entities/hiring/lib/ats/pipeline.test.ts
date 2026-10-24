import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The hiring manager's Reject in Team (A.36). Until A.36 it wrote the status
// and nothing else, so the candidate's interviews stayed booked and the
// hiring chain's rule never ran. It now decides through the module every
// surface uses, and says the chain's refusal in a manager's words.

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table) },
  supabase: { from: (table: string) => builderFor(table) },
  htt: { from: (table: string) => builderFor(table) },
}));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => {}) }));
const chainRefusal = vi.hoisted(() => ({ value: null as string | null }));
vi.mock("../chain/direct-decision", async (importActual) => ({
  ...(await importActual<typeof import("../chain/direct-decision")>()),
  directDecisionRefusal: vi.fn(async () => chainRefusal.value),
}));
vi.mock("../chain/close", () => ({ closeChainForDecided: vi.fn(async () => {}) }));
const cancelled = vi.hoisted(() => ({ ids: [] as string[] }));
vi.mock("../interviews-writes", () => ({
  cancelScheduledInterviews: vi.fn(async (id: string) => { cancelled.ids.push(id); return { ok: true }; }),
}));

import { PROPOSE_INSTEAD } from "../chain/direct-decision";
import { MANAGER_ASKS_RECRUITING, rejectApplicationStage } from "./pipeline";

const MANAGER = { personId: "person-9", email: "manager@example.com" };
const STAGES = [
  { id: "st-screen", name: "Screen", position: 1, is_terminal: false },
  { id: "st-rejected", name: "Rejected", position: 9, is_terminal: true },
];

beforeEach(() => {
  resetFake();
  cancelled.ids.length = 0;
  chainRefusal.value = null;
});
afterEach(() => vi.clearAllMocks());

describe("rejectApplicationStage", () => {
  it("rejects onto the reject stage and cancels the candidate's scheduled interviews", async () => {
    // The application, then (inside the decision) its stage before the move and the write.
    script("applications", { data: { id: "app-1", job_requisition_id: "jr-1", current_stage_id: "st-screen" } }, { data: { current_stage_id: "st-screen" } }, { data: null });
    script("application_stages", { data: STAGES }, { data: { is_terminal: true } });
    script("application_stage_log", { data: null });

    await expect(rejectApplicationStage("app-1", MANAGER)).resolves.toEqual({ ok: true });

    const update = calls.find((c) => c.table === "applications" && c.ops[0] === "update");
    expect(update?.payloads[0]).toMatchObject({ status: "rejected", current_stage_id: "st-rejected" });
    expect(cancelled.ids).toEqual(["app-1"]);
  });

  it("refuses when the role's stages cannot be read, rather than rejecting with no reject stage", async () => {
    script("applications", { data: { id: "app-1", job_requisition_id: "jr-1", current_stage_id: "st-screen" } });
    script("application_stages", { error: { message: "timeout" } });

    await expect(rejectApplicationStage("app-1", MANAGER)).resolves.toEqual({ ok: false, error: "Could not read the role's pipeline stages: timeout" });

    expect(calls.filter((c) => c.ops[0] === "update")).toEqual([]);
  });

  it("tells a manager that recruiting proposes the decision when the application is in a live hiring chain", async () => {
    chainRefusal.value = PROPOSE_INSTEAD;
    script("applications", { data: { id: "app-1", job_requisition_id: "jr-1", current_stage_id: "st-screen" } });
    script("application_stages", { data: STAGES });

    await expect(rejectApplicationStage("app-1", MANAGER)).resolves.toEqual({ ok: false, error: MANAGER_ASKS_RECRUITING });

    expect(calls.filter((c) => c.ops[0] === "update")).toEqual([]);
    expect(cancelled.ids).toEqual([]);
  });
});

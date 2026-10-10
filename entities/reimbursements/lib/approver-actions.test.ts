import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script, scriptStorage } from "@/kernel/data/testing/fake-company-os";

// The approver's actions and Admin's document opener, end to end through the
// real lifecycle module on the kernel's fake (design §2.5, "Routes"): the
// guard comes first and names its permission, the claim is read and written
// unscoped, approve freezes the kept total, and the own-claim rule holds
// unless the viewer holds the Employer's reimbursements.decide-own.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: async () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const approvals: [string, Record<string, unknown>][] = [];
vi.mock("@/kernel/approvals/requests", () => ({
  openApproval: async (r: Record<string, unknown>) => (approvals.push(["open", r]), { ok: true }),
  decideApproval: async (r: Record<string, unknown>) => (approvals.push(["decide", r]), { ok: true }),
  decidePendingApproval: async (r: Record<string, unknown>) => (approvals.push(["decide", r]), { ok: true, decided: true }),
  cancelApproval: async (r: Record<string, unknown>) => (approvals.push(["cancel", r]), { ok: true }),
}));
const told: unknown[] = [];
vi.mock("@/entities/reimbursements/lib/notices", () => ({
  tellOwnerOfDecision: async (d: unknown) => void told.push(d),
  tellApproversOfCheck: async () => {},
}));
const asked: string[] = [];
let viewer: string | null = "person-employer";
let holds = new Set<string>();
let refused = false;
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async (p: string) => {
    asked.push(p);
    if (refused) throw new Error("NEXT_NOT_FOUND");
    return { personId: viewer, user: { email: "employer@example.test" }, may: (q: string) => holds.has(q) };
  },
}));

import { approverDecides, openClaimFileInAdmin } from "./decision-actions";

const CLAIM = "11111111-1111-4111-8111-111111111111";
const claimRow = (person_id = "person-a", status = "checked") => ({ data: { id: CLAIM, status, person_id, title: "Hanoi workshop", submitted_at: "2026-10-01T03:00:00Z" } });
const claimUpdates = () => calls.filter((c) => c.table === "reimbursement_claims" && c.ops[0] === "update");

beforeEach(() => {
  resetFake();
  approvals.length = 0;
  told.length = 0;
  asked.length = 0;
  viewer = "person-employer";
  holds = new Set();
  refused = false;
});

describe("approverDecides", () => {
  it("approves a checked claim after its guard: an unscoped write guarded on checked, the kept total frozen", async () => {
    script("reimbursement_claims", claimRow(), { data: [{ id: CLAIM }] });
    script("reimbursement_claim_items", {
      data: [
        { id: "item-1", amount_vnd: 126000, declined_at: null },
        { id: "item-2", amount_vnd: 900000, declined_at: "2026-10-02T03:00:00Z" },
      ],
    });
    script("reimbursement_claim_events", { data: { id: "event-1" } });
    expect(await approverDecides(CLAIM, "approve")).toEqual({ ok: true });
    expect(asked).toEqual(["reimbursements.approve"]);
    const [update] = claimUpdates();
    expect(update.payloads[0]).toMatchObject({ status: "approved", approved_by: "person-employer", approved_total_vnd: 126000 });
    expect(update.filters).toEqual([
      ["eq", "id", CLAIM],
      ["eq", "status", "checked"],
    ]);
    expect(approvals.map(([verb, r]) => [verb, r.subjectType, r.state])).toEqual([["decide", "reimbursement_approval", "approved"]]);
  });

  // Plan §10, 20261008090000: a receipt its owner removed stays on the claim
  // and counts toward nothing, so the total approval freezes, and that the run
  // pays, leaves it out, and it is not among the declined.
  it("freezes a total that leaves out a receipt its owner removed, declined or not", async () => {
    script("reimbursement_claims", claimRow(), { data: [{ id: CLAIM }] });
    const items = {
      data: [
        { id: "item-1", amount_vnd: 126000, declined_at: null, removed_at: null },
        { id: "item-2", amount_vnd: 900000, declined_at: null, removed_at: "2026-10-06T03:00:00Z" },
        { id: "item-3", amount_vnd: null, declined_at: null, removed_at: "2026-10-06T03:00:00Z" },
        { id: "item-4", amount_vnd: 70000, declined_at: "2026-10-02T03:00:00Z", removed_at: "2026-10-06T03:00:00Z" },
      ],
    };
    script("reimbursement_claim_items", items, items);
    script("reimbursement_claim_events", { data: { id: "event-1" } });
    expect(await approverDecides(CLAIM, "approve")).toEqual({ ok: true });
    expect(claimUpdates()[0].payloads[0]).toMatchObject({ status: "approved", approved_total_vnd: 126000 });
    const [, decided] = approvals.find(([verb]) => verb === "decide") ?? [];
    expect((decided?.metadata as Record<string, unknown>).declinedItemIds).toBeUndefined();
  });

  it("refuses to approve a claim whose every receipt left is removed or declined", async () => {
    script("reimbursement_claims", claimRow());
    const items = {
      data: [
        { id: "item-1", amount_vnd: 126000, declined_at: "2026-10-02T03:00:00Z", removed_at: null },
        { id: "item-2", amount_vnd: 900000, declined_at: null, removed_at: "2026-10-06T03:00:00Z" },
      ],
    };
    script("reimbursement_claim_items", items, items);
    expect(await approverDecides(CLAIM, "approve")).toEqual({ ok: false, error: "Every receipt is declined: reject the claim instead." });
    expect(claimUpdates()).toHaveLength(0);
  });

  it("sends a checked claim back with its reason and tells the owner it came from the approval", async () => {
    script("reimbursement_claims", claimRow(), { data: [{ id: CLAIM }] });
    script("reimbursement_claim_items", { data: [] });
    script("reimbursement_claim_events", { data: { id: "event-2" } });
    expect(await approverDecides(CLAIM, "send_back", "Which client is this for?")).toEqual({ ok: true });
    expect(told).toEqual([expect.objectContaining({ became: "sent_back", step: "approval", reason: "Which client is this for?" })]);
  });

  it("refuses the approver's own claim, unless they hold decide-own", async () => {
    script("reimbursement_claims", claimRow("person-employer"));
    expect(await approverDecides(CLAIM, "approve")).toEqual({ ok: false, error: "You cannot check or approve your own claim." });
    expect(claimUpdates()).toHaveLength(0);

    holds.add("reimbursements.decide-own");
    script("reimbursement_claims", claimRow("person-employer"), { data: [{ id: CLAIM }] });
    script("reimbursement_claim_items", { data: [{ id: "item-1", amount_vnd: 50000, declined_at: null }] });
    script("reimbursement_claim_events", { data: { id: "event-3" } });
    expect(await approverDecides(CLAIM, "approve")).toEqual({ ok: true });
  });

  it("refuses an unknown move, a check, a malformed id and a viewer with no person record, without reading", async () => {
    expect(await approverDecides(CLAIM, "check" as never)).toEqual({ ok: false, error: "Unknown move." });
    expect(await approverDecides("nope", "approve")).toMatchObject({ ok: false });
    viewer = null;
    expect(await approverDecides(CLAIM, "approve")).toMatchObject({ ok: false });
    expect(calls).toHaveLength(0);
  });

  it("reads nothing for someone without reimbursements.approve", async () => {
    refused = true;
    await expect(approverDecides(CLAIM, "approve")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(calls).toHaveLength(0);
  });
});

describe("openClaimFileInAdmin", () => {
  it("signs a document on the claim it names after Admin's view guard", async () => {
    script("reimbursement_files", { data: { storage_path: `claim/${CLAIM}/item-1/f.pdf`, filename: "f.pdf" } });
    scriptStorage("createSignedUrl", { data: { signedUrl: "https://store.test/f" } });
    expect(await openClaimFileInAdmin(CLAIM, "33333333-3333-4333-8333-333333333333")).toEqual({ ok: true, url: "https://store.test/f" });
    expect(asked).toEqual(["reimbursements.view"]);
    const [read] = calls.filter((c) => c.table === "reimbursement_files");
    expect(read.filters).toEqual(expect.arrayContaining([["eq", "reimbursement_claim_items.claim_id", CLAIM]]));
  });

  it("refuses a malformed id without reading", async () => {
    expect(await openClaimFileInAdmin(CLAIM, "x")).toEqual({ ok: false, error: "File not found." });
    expect(calls).toHaveLength(0);
  });
});

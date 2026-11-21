import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script, scriptStorage, storageCalls } from "@/kernel/data/testing/fake-company-os";

// The checker's actions, end to end through the real lifecycle module on the
// kernel's fake (design §2.5, "Routes"): the guard comes first and names
// reimbursements.check, the claim is read and written unscoped (the guard
// reaches every claim), and the own-claim rule holds even though the
// permission does. The approvals primitive and the owner's email are recorded.
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
let viewer: string | null = "person-finance";
// The permissions the viewer holds besides the guard's: the Employer's
// reimbursements.decide-own is the only one an action reads.
let holds = new Set<string>();
// The real guard ends a refused request (notFound or a redirect), which throws.
let refused = false;
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async (p: string) => {
    asked.push(p);
    if (refused) throw new Error("NEXT_NOT_FOUND");
    return { personId: viewer, user: { email: "finance@example.test" }, may: (q: string) => holds.has(q) };
  },
}));

import { revalidatePath } from "next/cache";
import { decideClaim, declineItem, enterItemRate, openClaimFile, rereadReceipt } from "./decision-actions";

const CLAIM = "11111111-1111-4111-8111-111111111111";
const ITEM = "22222222-2222-4222-8222-222222222222";
const claimRow = (person_id = "person-a") => ({ data: { id: CLAIM, status: "submitted", person_id, title: "Hanoi workshop", submitted_at: "2026-10-01T03:00:00Z" } });
const claimUpdates = () => calls.filter((c) => c.table === "reimbursement_claims" && c.ops[0] === "update");
// What the decider's page read (RB.28): the stamp claimRow carries and the kept total its receipts come to.
const STAMP = "2026-10-01T03:00:00Z";
const mark = (totalVnd: number, submittedAt = STAMP) => ({ submittedAt, totalVnd });
const BIG = { id: "item-big", amount_vnd: 60_000_000, declined_at: null, removed_at: null };

beforeEach(() => {
  resetFake();
  approvals.length = 0;
  told.length = 0;
  asked.length = 0;
  viewer = "person-finance";
  holds = new Set();
  refused = false;
});

describe("decideClaim", () => {
  it("checks a claim after its guard, with an unscoped writer guarded on the status it read", async () => {
    script("reimbursement_claims", claimRow(), { data: [{ id: CLAIM }] });
    // The mark's total read now, the declined receipts, the rate-pending ones, then the total the check approves under.
    script("reimbursement_claim_items", { data: [BIG] }, { data: [] }, { data: [] }, { data: [BIG] });
    script("reimbursement_claim_events", { data: { id: "event-1" } });
    expect(await decideClaim(CLAIM, "check", mark(60_000_000))).toEqual({ ok: true });
    expect(asked).toEqual(["reimbursements.check"]);
    const [update] = claimUpdates();
    expect(update.payloads[0]).toMatchObject({ status: "checked", checked_by: "person-finance" });
    expect(update.filters).toEqual([
      ["eq", "id", CLAIM],
      ["eq", "submitted_at", STAMP],
      ["eq", "status", "submitted"],
    ]);
    expect(approvals.map(([verb, r]) => [verb, r.subjectType])).toEqual([
      ["decide", "reimbursement_check"],
      ["open", "reimbursement_approval"],
    ]);
  });

  it("sends a claim back with its reason and tells the owner", async () => {
    script("reimbursement_claims", claimRow(), { data: [{ id: CLAIM }] });
    script("reimbursement_claim_items", { data: [] }, { data: [] });
    script("reimbursement_claim_events", { data: { id: "event-2" } });
    expect(await decideClaim(CLAIM, "send_back", mark(0), "Add the red invoice.")).toEqual({ ok: true });
    expect(told).toEqual([expect.objectContaining({ claimId: CLAIM, ownerPersonId: "person-a", became: "sent_back", reason: "Add the red invoice." })]);
  });

  it("refuses the checker's own claim, though the permission reaches every claim", async () => {
    script("reimbursement_claims", claimRow("person-finance"));
    expect(await decideClaim(CLAIM, "check", mark(0))).toEqual({ ok: false, error: "You cannot check or approve your own claim." });
    expect(claimUpdates()).toHaveLength(0);
  });

  it("lets the employer check their own claim: decide-own is read from the viewer's access", async () => {
    holds.add("reimbursements.decide-own");
    script("reimbursement_claims", claimRow("person-finance"), { data: [{ id: CLAIM }] });
    // The mark's total, the declined receipts, then the rate-pending ones the check refuses on (RB.10).
    script("reimbursement_claim_items", { data: [BIG] }, { data: [] }, { data: [] }, { data: [BIG] });
    script("reimbursement_claim_events", { data: { id: "event-1" } });
    expect(await decideClaim(CLAIM, "check", mark(60_000_000))).toEqual({ ok: true });
    expect(claimUpdates()[0].payloads[0]).toMatchObject({ status: "checked", checked_by: "person-finance" });
  });

  it("refuses a checker with no person record before reading anything", async () => {
    viewer = null;
    const result = await decideClaim(CLAIM, "check", mark(0));
    expect(result.ok).toBe(false);
    expect(asked).toEqual(["reimbursements.check"]);
    expect(calls).toHaveLength(0);
  });

  it("refuses an unknown move and a malformed id without reading", async () => {
    expect(await decideClaim(CLAIM, "approve" as "check", mark(0))).toEqual({ ok: false, error: "Unknown move." });
    expect((await decideClaim("not-an-id", "check", mark(0))).ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

// RB.28: a decision lands only on the claim its decider read. The owner can
// withdraw, change the receipts and submit again, which leaves the status as it
// was; the rates cron can value a receipt under an open page. Either way the
// click is refused, nothing is written or recorded, and nobody is told.
describe("a decision on a claim that changed since the page was drawn", () => {
  const CHANGED = { ok: false, error: "This claim changed while you were working on it. Reload and try again." };
  const nothingHappened = () => {
    expect(claimUpdates()).toHaveLength(0);
    expect(calls.filter((c) => c.table === "reimbursement_claim_events")).toHaveLength(0);
    expect(approvals).toEqual([]);
    expect(told).toEqual([]);
  };
  // The refused page is drawn again, so the decider reads the claim as it now is.
  const redrawn = () => {
    expect(revalidatePath).toHaveBeenCalledWith(`/team/finance/claims/${CLAIM}`);
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/finance/reimbursements/${CLAIM}`);
  };
  beforeEach(() => vi.mocked(revalidatePath).mockClear());

  it("refuses a check on a claim its owner withdrew, changed and submitted again", async () => {
    script("reimbursement_claims", { data: { ...claimRow().data, submitted_at: "2026-10-02T09:30:00Z" } });
    expect(await decideClaim(CLAIM, "check", mark(60_000_000))).toEqual(CHANGED);
    expect(calls.filter((c) => c.table === "reimbursement_claim_items")).toHaveLength(0);
    nothingHappened();
    redrawn();
  });

  it("refuses a check whose total moved under the page, as when a pending rate is filled in", async () => {
    script("reimbursement_claims", claimRow());
    // The page read 1,000,000 with a second receipt still waiting for its rate; it now has one.
    script("reimbursement_claim_items", {
      data: [
        { id: "item-1", amount_vnd: 1_000_000, declined_at: null, removed_at: null },
        { id: "item-2", amount_vnd: 450_000, declined_at: null, removed_at: null },
      ],
    });
    expect(await decideClaim(CLAIM, "check", mark(1_000_000))).toEqual(CHANGED);
    nothingHappened();
    redrawn();
  });

  it("refuses a send back and a rejection on a claim submitted again, so a reason is always about the claim read", async () => {
    script("reimbursement_claims", { data: { ...claimRow().data, submitted_at: "2026-10-02T09:30:00Z" } });
    expect(await decideClaim(CLAIM, "send_back", mark(0), "Add the red invoice.")).toEqual(CHANGED);
    script("reimbursement_claims", { data: { ...claimRow().data, submitted_at: "2026-10-02T09:30:00Z" } });
    expect(await decideClaim(CLAIM, "reject", mark(0), "Not a company cost.")).toEqual(CHANGED);
    nothingHappened();
  });

  it("asks a page that sent no mark to reload, before reading anything", async () => {
    expect(await decideClaim(CLAIM, "check", undefined as unknown as { submittedAt: string; totalVnd: number })).toEqual(CHANGED);
    expect(await decideClaim(CLAIM, "check", { submittedAt: "", totalVnd: 0 })).toEqual(CHANGED);
    expect(await decideClaim(CLAIM, "check", { submittedAt: STAMP, totalVnd: -1 })).toEqual(CHANGED);
    expect(calls).toHaveLength(0);
    redrawn();
  });

  it("keeps the stamp in the write itself, so a resubmission between the read and the write matches nothing", async () => {
    script("reimbursement_claims", claimRow(), { data: [] });
    script("reimbursement_claim_items", { data: [] }, { data: [] });
    expect(await decideClaim(CLAIM, "send_back", mark(0), "Add the red invoice.")).toEqual(CHANGED);
    expect(claimUpdates()[0].filters).toEqual(expect.arrayContaining([["eq", "submitted_at", STAMP]]));
    expect(told).toEqual([]);
  });
});

describe("declineItem", () => {
  it("declines a receipt on the claim it names, after its guard", async () => {
    script("reimbursement_claims", claimRow());
    script("reimbursement_claim_items", { data: [{ id: ITEM }] });
    expect(await declineItem(CLAIM, ITEM, "Personal dinner")).toEqual({ ok: true });
    expect(asked).toEqual(["reimbursements.check"]);
    const [update] = calls.filter((c) => c.table === "reimbursement_claim_items" && c.ops[0] === "update");
    expect(update.filters).toEqual([
      ["eq", "id", ITEM],
      ["eq", "claim_id", CLAIM],
      ["is", "removed_at", null],
    ]);
  });
});

describe("enterItemRate", () => {
  it("values a rate-pending receipt at a rate the checker typed, after its guard", async () => {
    script("reimbursement_claims", claimRow());
    script(
      "reimbursement_claim_items",
      { data: { id: ITEM, claim_id: CLAIM, currency: "aud", amount_cents: 6280, bought_on: "2026-10-03", charged_vnd: null } },
      { data: [{ id: ITEM }] },
    );
    script("reimbursement_fx_rates", { data: null });
    expect(await enterItemRate(CLAIM, ITEM, "18,400")).toEqual({ ok: true });
    expect(asked).toEqual(["reimbursements.check"]);
    const [update] = calls.filter((c) => c.table === "reimbursement_claim_items" && c.ops[0] === "update");
    expect(update.payloads[0]).toMatchObject({ amount_vnd: 1155520, fx_source: "manual" });
    const [kept] = calls.filter((c) => c.table === "reimbursement_fx_rates");
    expect(kept.payloads[0]).toMatchObject({ source: "manual", entered_by: "person-finance" });
  });

  it("refuses on the checker's own claim", async () => {
    script("reimbursement_claims", claimRow("person-finance"));
    expect(await enterItemRate(CLAIM, ITEM, "18400")).toEqual({ ok: false, error: "You cannot check or approve your own claim." });
    expect(calls.filter((c) => c.ops[0] !== "select")).toHaveLength(0);
  });

  it("reads and writes nothing for someone without reimbursements.check", async () => {
    refused = true;
    await expect(enterItemRate(CLAIM, ITEM, "18400")).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe("openClaimFile", () => {
  const FILE = "33333333-3333-4333-8333-333333333333";
  const PATH = `claim/${CLAIM}/${ITEM}/${FILE}-HD-0831.pdf`;

  it("opens a red invoice after its guard: a fresh link to that file, on the claim it names", async () => {
    script("reimbursement_files", { data: { storage_path: PATH, filename: "HĐ 0831.pdf" } });
    scriptStorage("createSignedUrl", { data: { signedUrl: "https://store.test/red-invoice" } });
    expect(await openClaimFile(CLAIM, FILE)).toEqual({ ok: true, url: "https://store.test/red-invoice" });
    expect(asked).toEqual(["reimbursements.view"]);
    const [read] = calls.filter((c) => c.table === "reimbursement_files");
    expect(read.filters).toEqual(
      expect.arrayContaining([
        ["eq", "id", FILE],
        ["eq", "reimbursement_claim_items.claim_id", CLAIM],
      ]),
    );
    expect(storageCalls.map((c) => [c.op, c.args[0]])).toEqual([["createSignedUrl", PATH]]);
  });

  it("reads and signs nothing for someone without reimbursements.view", async () => {
    refused = true;
    await expect(openClaimFile(CLAIM, FILE)).rejects.toThrow();
    expect(asked).toEqual(["reimbursements.view"]);
    expect(calls).toHaveLength(0);
    expect(storageCalls).toHaveLength(0);
  });

  it("refuses a malformed id without reading", async () => {
    expect(await openClaimFile(CLAIM, "not-an-id")).toEqual({ ok: false, error: "File not found." });
    expect(await openClaimFile("not-an-id", FILE)).toEqual({ ok: false, error: "File not found." });
    expect(calls).toHaveLength(0);
    expect(storageCalls).toHaveLength(0);
  });
});

describe("rereadReceipt", () => {
  it("reads nothing for someone without reimbursements.check", async () => {
    refused = true;
    await expect(rereadReceipt(CLAIM, ITEM)).rejects.toThrow();
    expect(asked).toEqual(["reimbursements.check"]);
    expect(calls).toHaveLength(0);
  });

  it("looks for the receipt's documents on that claim only, and says so when there is none to read", async () => {
    script("reimbursement_files", { data: [] });
    expect(await rereadReceipt(CLAIM, ITEM)).toEqual({ ok: false, error: "This receipt has no document to read." });
    const read = calls.find((c) => c.table === "reimbursement_files");
    expect(read?.filters).toEqual(
      expect.arrayContaining([
        ["eq", "claim_item_id", ITEM],
        ["eq", "reimbursement_claim_items.claim_id", CLAIM],
      ]),
    );
  });
});

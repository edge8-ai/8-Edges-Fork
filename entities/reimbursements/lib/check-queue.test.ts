import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerOnlySelectedColumns, calls, fakeSupabase, resetFake, script, scriptStorage, storageCalls } from "@/kernel/data/testing/fake-company-os";

// The checker's queue (plan section 8, design §1.5): every submitted claim but
// the viewer's own, oldest first, each with who claimed it, how many receipts
// and the total a checker would pass. Scripted on the kernel's fake, which
// answers only the columns each read selected: drop `declined_at` from the
// queue's select and a declined receipt would be counted here as in production.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

import { listClaimsForAdmin, listClaimsToApprove, listClaimsToCheck, readClaimForChecker } from "./check-queue";

const FINANCE = "person-finance";

beforeEach(() => {
  resetFake();
  answerOnlySelectedColumns();
});

describe("listClaimsToCheck", () => {
  it("lists submitted claims, never the viewer's own, oldest submission first", async () => {
    script("reimbursement_claims", {
      data: [
        { id: "claim-1", title: "Hanoi workshop", person_id: "person-a", submitted_at: "2026-10-01T03:00:00Z", owner: { display_name: "Avery Stone" } },
        { id: "claim-2", title: "Sydney trip", person_id: "person-c", submitted_at: "2026-10-03T03:00:00Z", owner: { display_name: "Casey Reed" } },
      ],
    });
    script("reimbursement_claim_items", {
      data: [
        { claim_id: "claim-1", amount_vnd: 126000, declined_at: null, ai_flags: ["possible_duplicate"] },
        { claim_id: "claim-1", amount_vnd: 900000, declined_at: "2026-10-02T03:00:00Z", ai_flags: ["unreadable"] },
        { claim_id: "claim-2", amount_vnd: 50000, declined_at: null, ai_flags: [] },
      ],
    });
    const queue = await listClaimsToCheck(FINANCE);
    // Waiting since submission (RB.14); a declined receipt's warning is no longer anything to look at.
    expect(queue).toEqual([
      { id: "claim-1", title: "Hanoi workshop", ownerName: "Avery Stone", submittedAt: "2026-10-01T03:00:00Z", receipts: 2, declined: 1, totalVnd: 126000, ratePending: 0, stageAt: "2026-10-01T03:00:00Z", flagged: 1 },
      { id: "claim-2", title: "Sydney trip", ownerName: "Casey Reed", submittedAt: "2026-10-03T03:00:00Z", receipts: 1, declined: 0, totalVnd: 50000, ratePending: 0, stageAt: "2026-10-03T03:00:00Z", flagged: 0 },
    ]);
    const [read] = calls.filter((c) => c.table === "reimbursement_claims");
    expect(read.filters).toEqual(expect.arrayContaining([["eq", "status", "submitted"], ["neq", "person_id", FINANCE]]));
  });

  it("reads nothing more when nothing waits, and a failed read raises rather than reading as an empty queue", async () => {
    script("reimbursement_claims", { data: [] });
    expect(await listClaimsToCheck(FINANCE)).toEqual([]);
    expect(calls.filter((c) => c.table === "reimbursement_claim_items")).toHaveLength(0);
    script("reimbursement_claims", { error: { message: "db down" } });
    await expect(listClaimsToCheck(FINANCE)).rejects.toThrow();
  });

  it("lists the employer's own claims too: decide-own lifts the own-claim rule", async () => {
    script("reimbursement_claims", { data: [] });
    await listClaimsToCheck(FINANCE, { includeOwn: true });
    const [read] = calls.filter((c) => c.table === "reimbursement_claims");
    expect(read.filters).toEqual([["eq", "status", "submitted"]]);
  });
});

describe("listClaimsToApprove", () => {
  it("lists checked claims, never the viewer's own unless they may decide it, oldest check first", async () => {
    script("reimbursement_claims", {
      data: [{ id: "claim-1", title: "Hanoi workshop", status: "checked", person_id: "person-a", submitted_at: "2026-10-01T03:00:00Z", checked_at: "2026-10-04T03:00:00Z", owner: { display_name: "Avery Stone" } }],
    });
    script("reimbursement_claim_items", {
      data: [
        { claim_id: "claim-1", amount_vnd: 126000, declined_at: null },
        { claim_id: "claim-1", amount_vnd: 900000, declined_at: "2026-10-02T03:00:00Z" },
      ],
    });
    // A checked claim has waited since it was checked (RB.14).
    expect(await listClaimsToApprove("person-employer")).toEqual([
      { id: "claim-1", title: "Hanoi workshop", ownerName: "Avery Stone", submittedAt: "2026-10-01T03:00:00Z", receipts: 2, declined: 1, totalVnd: 126000, ratePending: 0, stageAt: "2026-10-04T03:00:00Z", flagged: 0 },
    ]);
    const [read] = calls.filter((c) => c.table === "reimbursement_claims");
    expect(read.filters).toEqual([
      ["eq", "status", "checked"],
      ["neq", "person_id", "person-employer"],
    ]);
    expect(read.ops).toContain("order");

    script("reimbursement_claims", { data: [] });
    await listClaimsToApprove("person-employer", { includeOwn: true });
    expect(calls.filter((c) => c.table === "reimbursement_claims")[1].filters).toEqual([["eq", "status", "checked"]]);
  });
});

describe("listClaimsForAdmin", () => {
  const row = (id: string, status: string, approved_total_vnd: number | null) => ({
    id,
    title: `Claim ${id}`,
    status,
    person_id: "person-a",
    submitted_at: "2026-10-01T03:00:00Z",
    approved_total_vnd,
    owner: { display_name: "Avery Stone" },
  });

  it("all: every claim past draft, the viewer's own included, each with its status and the frozen total once approved", async () => {
    script("reimbursement_claims", { data: [row("claim-1", "submitted", null), row("claim-2", "approved", 100000)] });
    script("reimbursement_claim_items", {
      data: [
        { claim_id: "claim-1", amount_vnd: 126000, declined_at: null },
        { claim_id: "claim-2", amount_vnd: 100000, declined_at: null },
        { claim_id: "claim-2", amount_vnd: 900000, declined_at: "2026-10-02T03:00:00Z" },
      ],
    });
    const all = await listClaimsForAdmin("all");
    expect(all.map((c) => [c.id, c.status, c.totalVnd, c.declined])).toEqual([
      ["claim-1", "submitted", 126000, 0],
      ["claim-2", "approved", 100000, 1],
    ]);
    const [read] = calls.filter((c) => c.table === "reimbursement_claims");
    expect(read.filters).toEqual([["neq", "status", "draft"]]);
  });

  it("approved: approved and in a run, not yet paid; paid: paid", async () => {
    script("reimbursement_claims", { data: [] }, { data: [] });
    await listClaimsForAdmin("approved");
    await listClaimsForAdmin("paid");
    const reads = calls.filter((c) => c.table === "reimbursement_claims").map((c) => c.filters);
    expect(reads).toEqual([[["in", "status", ["approved", "in_run"]]], [["eq", "status", "paid"]]]);
  });
});

// One claim in full for its checker (RB.3.3): each receipt beside its line,
// and the total the checker confirms it goes to the approver at. Read through
// the real owner's detail read and the real signer, on the fake.
const CLAIM = "claim-1";
const claimRow = { id: CLAIM, title: "Hanoi workshop", status: "submitted", person_id: "person-a", submitted_at: "2026-10-01T03:00:00Z", approved_total_vnd: null, approved_at: null, paid_at: null, created_at: "2026-09-30T03:00:00Z" };
const item = (id: string, amountVnd: number, extra: Record<string, unknown> = {}) => ({
  id,
  description: null,
  seller: `Seller ${id}`,
  bought_on: null,
  category: "transport",
  amount_cents: amountVnd,
  currency: "vnd",
  amount_vnd: amountVnd,
  declined_at: null,
  bought_in_vietnam: true,
  lost_receipt_note: null,
  decline_reason: null,
  ...extra,
});
const DECLINED = { declined_at: "2026-10-02T03:00:00Z", decline_reason: "Personal dinner" };
const PHOTO = "claim/claim-1/item-1/file-1-grab.jpg";
const RED_INVOICE = "claim/claim-1/item-3/file-3-HD-0831.pdf";

/** Scripts the claim, its owner, its receipts, their documents and the signed links, in the order they are read. */
function scriptClaim(items: Record<string, unknown>[]) {
  script("reimbursement_claims", { data: [{ ...claimRow, owner: { display_name: "Avery Stone" } }] });
  script("reimbursement_claim_items", { data: items });
  script("reimbursement_claim_events", { data: [] });
  script(
    "reimbursement_files",
    {
      data: [
        { id: "file-1", claim_item_id: "item-1", kind: "receipt", filename: "grab.jpg", mime_type: "image/jpeg", size_bytes: 1000 },
        { id: "file-3", claim_item_id: "item-3", kind: "red_invoice", filename: "HĐ 0831.pdf", mime_type: "application/pdf", size_bytes: 2000 },
      ],
    },
    {
      data: [
        { id: "file-1", storage_path: PHOTO, mime_type: "image/jpeg" },
        { id: "file-3", storage_path: RED_INVOICE, mime_type: "application/pdf" },
      ],
    },
  );
  scriptStorage("createSignedUrls", {
    data: [
      { path: PHOTO, signedUrl: "https://store.test/1", error: null },
      { path: RED_INVOICE, signedUrl: "https://store.test/3", error: null },
    ],
  });
}

describe("readClaimForChecker", () => {
  it("shows each document beside its own line, signed, and the total the checker confirms leaves the declined receipt out", async () => {
    scriptClaim([item("item-1", 126000), item("item-2", 900000, DECLINED), item("item-3", 500000)]);
    const claim = await readClaimForChecker(CLAIM);
    if (!claim) throw new Error("expected the claim");
    expect(claim.ownerName).toBe("Avery Stone");
    // Each receipt carries its own documents, and nothing of another line's.
    expect(claim.items.map((i) => [i.id, i.documents.map((d) => [d.id, d.kind])])).toEqual([
      ["item-1", [["file-1", "receipt"]]],
      ["item-2", []],
      ["item-3", [["file-3", "red_invoice"]]],
    ]);
    // The red invoice is signed too, so the page can open it beside its line.
    expect(claim.documents.get("file-1")).toEqual({ url: "https://store.test/1", mimeType: "image/jpeg" });
    expect(claim.documents.get("file-3")).toEqual({ url: "https://store.test/3", mimeType: "application/pdf" });
    expect(claim.items.map((i) => i.declined)).toEqual([false, true, false]);
    // 126,000 + 500,000: the 900,000 dinner is declined and does not go on.
    expect(claim.keptTotalVnd).toBe(626000);
    expect(claim.declined).toBe(1);
    // The owner's own figure for a claim being checked still counts every
    // receipt, which is why the checker's total is a figure of its own.
    expect(claim.totalVnd).toBe(1526000);
  });

  it("reads the claim row once, its claimant with it", async () => {
    scriptClaim([item("item-1", 126000)]);
    const claim = await readClaimForChecker(CLAIM);
    expect(claim?.ownerName).toBe("Avery Stone");
    expect(calls.filter((c) => c.table === "reimbursement_claims")).toHaveLength(1);
  });

  it("confirms the same total and declined count the queue shows for the same receipts", async () => {
    // A declined line is one with declined_at set. The table's shape check
    // only asks that the reason is not null, so an empty reason is a declined
    // line too, and both figures must leave it out.
    const rows = [item("item-1", 126000), item("item-2", 900000, DECLINED), item("item-3", 500000), item("item-4", 70000, { declined_at: "2026-10-02T04:00:00Z", decline_reason: "" })];
    script("reimbursement_claims", { data: [{ id: CLAIM, title: "Hanoi workshop", person_id: "person-a", submitted_at: "2026-10-01T03:00:00Z", owner: { display_name: "Avery Stone" } }] });
    script("reimbursement_claim_items", { data: rows.map((r) => ({ claim_id: CLAIM, amount_vnd: r.amount_vnd, declined_at: r.declined_at })) });
    const [queued] = await listClaimsToCheck(FINANCE);
    scriptClaim(rows);
    const claim = await readClaimForChecker(CLAIM);
    expect(queued).toMatchObject({ totalVnd: 626000, declined: 2 });
    expect(claim).toMatchObject({ keptTotalVnd: queued.totalVnd, declined: queued.declined });
  });

  it("counts a kept receipt whose rate is pending, in the queue and on the claim alike, and never a declined one (RB.10)", async () => {
    const rows = [item("item-1", 126000), item("item-2", 0, { amount_vnd: null }), item("item-3", 0, { amount_vnd: null, ...DECLINED })];
    script("reimbursement_claims", { data: [{ id: CLAIM, title: "Melbourne", person_id: "person-a", submitted_at: "2026-10-01T03:00:00Z", owner: { display_name: "Avery Stone" } }] });
    script("reimbursement_claim_items", { data: rows.map((r) => ({ claim_id: CLAIM, amount_vnd: r.amount_vnd, declined_at: r.declined_at })) });
    const [queued] = await listClaimsToCheck(FINANCE);
    scriptClaim(rows);
    const claim = await readClaimForChecker(CLAIM);
    expect(queued).toMatchObject({ totalVnd: 126000, ratePending: 1, declined: 1 });
    expect(claim).toMatchObject({ keptTotalVnd: 126000, ratePending: 1 });
  });

  it("is null for a claim that is not there, and signs nothing", async () => {
    script("reimbursement_claims", { data: [] });
    expect(await readClaimForChecker(CLAIM)).toBeNull();
    expect(storageCalls).toHaveLength(0);
    expect(calls.filter((c) => c.table === "reimbursement_files")).toHaveLength(0);
  });
});

// Plan §10, 20261008090000: a receipt its owner removed from a claim that was
// ever submitted stays on it, shown as removed, and a document they replaced
// stays beside its line, shown as replaced. Neither counts toward anything:
// not the queue's figures, not the total the checker confirms.
describe("removed receipts and replaced documents", () => {
  const REMOVED = { removed_at: "2026-10-06T03:00:00Z", remove_reason: "Charged twice" };

  it("leave the queue's receipts, total, declined and rate-pending figures", async () => {
    script("reimbursement_claims", { data: [{ id: CLAIM, title: "Hanoi workshop", person_id: "person-a", submitted_at: "2026-10-01T03:00:00Z", owner: { display_name: "Avery Stone" } }] });
    script("reimbursement_claim_items", {
      data: [
        { claim_id: CLAIM, amount_vnd: 126000, declined_at: null, removed_at: null },
        { claim_id: CLAIM, amount_vnd: 900000, declined_at: null, ...REMOVED },
        { claim_id: CLAIM, amount_vnd: null, declined_at: null, ...REMOVED },
        { claim_id: CLAIM, amount_vnd: 50000, declined_at: "2026-10-02T03:00:00Z", ...REMOVED },
      ],
    });
    const [queued] = await listClaimsToCheck(FINANCE);
    expect(queued).toMatchObject({ receipts: 1, totalVnd: 126000, declined: 0, ratePending: 0 });
  });

  it("are shown to the checker, marked, and left out of the total they confirm and the owner's figure", async () => {
    script("reimbursement_claims", { data: [{ ...claimRow, owner: { display_name: "Avery Stone" } }] });
    script("reimbursement_claim_items", { data: [item("item-1", 126000), item("item-2", 900000, REMOVED)] });
    script("reimbursement_claim_events", { data: [] });
    script(
      "reimbursement_files",
      {
        data: [
          { id: "file-1", claim_item_id: "item-1", kind: "receipt", filename: "grab.jpg", mime_type: "image/jpeg", size_bytes: 1000, replaced_at: "2026-10-06T03:00:00Z" },
          { id: "file-2", claim_item_id: "item-1", kind: "receipt", filename: "grab-2.jpg", mime_type: "image/jpeg", size_bytes: 1000, replaced_at: null },
        ],
      },
      { data: [] },
    );
    const claim = await readClaimForChecker(CLAIM);
    if (!claim) throw new Error("expected the claim");
    expect(claim.items.map((i) => [i.id, i.removed])).toEqual([
      ["item-1", null],
      ["item-2", { at: "2026-10-06T03:00:00Z", reason: "Charged twice" }],
    ]);
    expect(claim.items[0].documents.map((d) => [d.id, d.replacedAt])).toEqual([
      ["file-1", "2026-10-06T03:00:00Z"],
      ["file-2", null],
    ]);
    expect(claim).toMatchObject({ keptTotalVnd: 126000, declined: 0, ratePending: 0, totalVnd: 126000, receipts: 1 });
  });
});

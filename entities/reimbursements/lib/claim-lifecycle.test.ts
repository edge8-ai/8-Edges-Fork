import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerOnlySelectedColumns, calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The one step that moves a claim (design §2.3). What these assert is what a
// person or the history would observe: the patch the scoped writer was asked
// to land, the status it was guarded on, the event row appended, and what the
// action answers — never which helper ran. The items and files a submit reads
// are scripted on the kernel's fake, which answers only the columns each read
// selected: a submit decides on a document's kind, confirmation and type, so a
// read that stops selecting one of them must fail here, not in production.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const audited: unknown[] = [];
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: async (i: unknown) => void audited.push(i) }));
// The email to the owner is the notices module's (its own test proves who may
// receive it and what it says); here, only what the lifecycle asked it to tell.
const told: unknown[] = [];
const checkedTold: unknown[] = [];
const submissionTold: unknown[] = [];
vi.mock("./notices", () => ({
  tellOwnerOfDecision: async (i: unknown) => void told.push(i),
  tellApproversOfCheck: async (i: unknown) => void checkedTold.push(i),
  tellOfSubmission: async (i: unknown) => void submissionTold.push(i),
}));

import { resetSubscribers, subscribe } from "@/kernel/events";
import { claimWriterFor, createClaim, declineClaimItem, deleteDraftClaim, transitionClaim, type ClaimActor, type ClaimRow, type ClaimWriter } from "./claim-lifecycle";
import type { ClaimStatus } from "./claim-rules";

// What reached the kernel's bus (design §1.8): the catalogue facts a landed
// move states, as a subscriber the composition root wired would receive them.
const published: { name: string; payload: Record<string, unknown> }[] = [];
function listen() {
  resetSubscribers();
  for (const name of ["claim.submitted", "claim.decided", "claim.in_run", "claim.paid"] as const) {
    subscribe("test", name, (payload) => void published.push({ name, payload: payload as Record<string, unknown> }));
  }
}

const OWNER = "person-a";
const owner: ClaimActor = { kind: "owner", personId: OWNER, mayDecideOwn: false, label: "Avery" };
const row = (status: ClaimStatus, submittedAt: string | null = null): ClaimRow => ({
  id: "claim-1",
  status,
  personId: OWNER,
  title: "Hanoi client workshop",
  submittedAt,
});

type Answer = "lands" | "matches nothing" | "refused";
function writer(answer: Answer) {
  const asked: { patch: Record<string, unknown>; from: ClaimStatus }[] = [];
  const write: ClaimWriter = async (patch, from) => {
    asked.push({ patch: { ...patch }, from });
    if (answer === "refused") return { data: null, error: { message: "db down" } };
    return { data: answer === "lands" ? [{ id: "claim-1" }] : [], error: null };
  };
  return { write, asked };
}

// What reached company_os.approvals, in order: the verb, the row and the filters.
const approvalWrites = () =>
  calls
    .filter((c) => c.table === "approvals" && c.ops[0] !== "select")
    .map((c) => ({ op: c.ops[0], payload: c.payloads[0] as Record<string, unknown>, filters: c.filters }));

const approvalReads = () => calls.filter((c) => c.table === "approvals" && c.ops[0] === "select").map((c) => c.filters);

const events = () =>
  calls.filter((c) => c.table === "reimbursement_claim_events" && c.ops[0] === "insert").map((c) => c.payloads[0] as Record<string, unknown>);

// A made-up account number, held in a constant so no fixture writes one as a
// quoted literal beside its column name (the public fork's scanner refuses it).
// The total a landing check reads (RB.22): over the approval limit, so the
// claim waits for an approver as these tests describe.
const OVER_LIMIT = { data: [{ id: "item-big", amount_vnd: 60_000_000, declined_at: null, removed_at: null }] };

const ACCOUNT = "19034567";
// The owner's bank details on file (RB.5): a claim nobody could pay is not submitted.
function scriptBankOnFile() {
  script("people_sensitive", { data: { bank_name: "Techcombank", bank_account_number: ACCOUNT } });
}

// A claim with one VND item bought in Vietnam and its confirmed PDF red
// invoice, and the owner's bank details on file: everything submit needs.
function scriptSubmittable() {
  scriptBankOnFile();
  script("reimbursement_claim_items", {
    data: [{ id: "item-1", seller: "Grab", description: null, bought_on: "2026-10-02", currency: "vnd", amount_cents: 126000, bought_in_vietnam: true, lost_receipt_note: null }],
  });
  script("reimbursement_files", {
    data: [{ claim_item_id: "item-1", kind: "red_invoice", mime_type: "application/pdf", confirmed_at: "2026-10-02T04:00:00Z" }],
  });
}

beforeEach(() => {
  resetFake();
  answerOnlySelectedColumns();
  audited.length = 0;
  told.length = 0;
  checkedTold.length = 0;
  submissionTold.length = 0;
  published.length = 0;
  listen();
});

describe("transitionClaim: the owner's moves", () => {
  it("submits a ready draft: stamps submitted_at, guards on draft, appends one event", async () => {
    scriptSubmittable();
    script("reimbursement_claim_events", { data: null });
    script("approvals", { data: null }, { data: null });
    const { write, asked } = writer("lands");
    expect(await transitionClaim({ row: row("draft"), move: "submit", actor: owner, write })).toEqual({ ok: true });
    expect(asked).toHaveLength(1);
    expect(asked[0].from).toBe("draft");
    expect(asked[0].patch.status).toBe("submitted");
    expect(typeof asked[0].patch.submitted_at).toBe("string");
    expect(events()).toEqual([
      expect.objectContaining({ claim_id: "claim-1", from_status: "draft", to_status: "submitted", actor_person_id: OWNER }),
    ]);
    // The check waits on whoever holds reimbursements.check, never on a person.
    expect(approvalWrites()).toEqual([
      expect.objectContaining({
        op: "insert",
        payload: expect.objectContaining({
          subject_type: "reimbursement_check",
          subject_id: "claim-1",
          approver_permission: "reimbursements.check",
          approver_person_id: null,
          state: "pending",
        }),
      }),
    ]);
  });

  it("resubmits a sent-back claim the same way, opening a fresh check", async () => {
    scriptSubmittable();
    script("reimbursement_claim_events", { data: null });
    script("approvals", { data: null }, { data: null });
    const { write, asked } = writer("lands");
    expect(await transitionClaim({ row: row("sent_back", "2026-10-01T03:00:00Z"), move: "submit", actor: owner, write })).toEqual({ ok: true });
    expect(asked[0].from).toBe("sent_back");
    expect(events()[0]).toMatchObject({ from_status: "sent_back", to_status: "submitted" });
    expect(approvalWrites()).toEqual([
      expect.objectContaining({ op: "insert", payload: expect.objectContaining({ subject_type: "reimbursement_check", approver_permission: "reimbursements.check" }) }),
    ]);
  });

  it("withdraws a submitted claim back to draft and never clears submitted_at", async () => {
    script("reimbursement_claim_events", { data: null });
    script("approvals", { data: [{ id: "approval-check" }] });
    const { write, asked } = writer("lands");
    const result = await transitionClaim({ row: row("submitted", "2026-10-01T03:00:00Z"), move: "withdraw", actor: owner, write });
    expect(result).toEqual({ ok: true });
    // The database refuses to delete a claim whose submitted_at is set; a
    // withdrawn claim must keep it, or the ten-year rule would let it go.
    expect(asked).toEqual([{ patch: { status: "draft" }, from: "submitted" }]);
    expect(events()[0]).toMatchObject({ from_status: "submitted", to_status: "draft" });
    // It leaves Finance's queue: the pending check is cancelled.
    expect(approvalWrites()).toEqual([
      expect.objectContaining({ op: "update", payload: expect.objectContaining({ state: "cancelled", decided_by: OWNER }) }),
    ]);
  });

  it("refuses a submit the rules refuse, and writes nothing", async () => {
    script("reimbursement_claim_items", {
      data: [{ id: "item-1", seller: "13cabs", description: null, bought_on: "2026-10-04", currency: "aud", amount_cents: 6280, bought_in_vietnam: false, lost_receipt_note: null }],
    });
    scriptBankOnFile();
    script("reimbursement_files", { data: [] });
    const { write, asked } = writer("lands");
    const result = await transitionClaim({ row: row("draft"), move: "submit", actor: owner, write });
    expect(result).toEqual({
      ok: false,
      error: "13cabs · Oct 4, 2026 has no receipt: add one, or write why.",
    });
    expect(asked).toHaveLength(0);
    expect(events()).toHaveLength(0);
  });

  it("refuses to submit an item bought in Vietnam whose only document is a photo, and writes nothing", async () => {
    script("reimbursement_claim_items", {
      data: [{ id: "item-1", seller: "Grab", description: null, bought_on: "2026-10-02", currency: "vnd", amount_cents: 126000, bought_in_vietnam: true, lost_receipt_note: null }],
    });
    scriptBankOnFile();
    script("reimbursement_files", { data: [{ claim_item_id: "item-1", kind: "receipt", mime_type: "image/jpeg", confirmed_at: "2026-10-02T04:00:00Z" }] });
    const { write, asked } = writer("lands");
    const result = await transitionClaim({ row: row("draft"), move: "submit", actor: owner, write });
    expect(result).toEqual({
      ok: false,
      error: "Grab · Oct 2, 2026 was bought in Vietnam: a photo is a receipt, not a red invoice. Add the seller's e-invoice PDF.",
    });
    expect(asked).toHaveLength(0);
    expect(events()).toHaveLength(0);
  });

  it("refuses to submit for an owner with no bank details on file, reading only their own row, and writes nothing", async () => {
    script("reimbursement_claim_items", {
      data: [{ id: "item-1", seller: "Grab", description: null, bought_on: "2026-10-02", currency: "vnd", amount_cents: 126000, bought_in_vietnam: true, lost_receipt_note: null }],
    });
    script("reimbursement_files", { data: [{ claim_item_id: "item-1", kind: "red_invoice", mime_type: "application/pdf", confirmed_at: "2026-10-02T04:00:00Z" }] });
    // A bank's name alone: Finance cannot transfer without the account number.
    script("people_sensitive", { data: { bank_name: "Techcombank", bank_account_number: null } });
    const { write, asked } = writer("lands");
    expect(await transitionClaim({ row: row("draft"), move: "submit", actor: owner, write })).toEqual({
      ok: false,
      error: "Add your bank details before submitting.",
    });
    expect(calls.filter((c) => c.table === "people_sensitive").map((c) => c.filters)).toEqual([[["eq", "person_id", OWNER]]]);
    expect(asked).toHaveLength(0);
    expect(events()).toHaveLength(0);
  });

  it("refuses a move the transition table refuses, before reading or writing anything", async () => {
    const { write, asked } = writer("lands");
    const result = await transitionClaim({ row: row("checked", "2026-10-01T03:00:00Z"), move: "withdraw", actor: owner, write });
    expect(result).toEqual({ ok: false, error: "This claim has been checked, so it can no longer be withdrawn." });
    expect(asked).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it("answers ok without writing when the claim is already where the move leads", async () => {
    const { write, asked } = writer("lands");
    expect(await transitionClaim({ row: row("draft"), move: "withdraw", actor: owner, write })).toEqual({ ok: true });
    expect(asked).toHaveLength(0);
    expect(events()).toHaveLength(0);
  });

  it("records and announces nothing when the guarded write matched nothing", async () => {
    const { write } = writer("matches nothing");
    const result = await transitionClaim({ row: row("submitted", "2026-10-01T03:00:00Z"), move: "withdraw", actor: owner, write });
    expect(result).toEqual({ ok: false, error: "This claim changed while you were working on it. Reload and try again." });
    expect(events()).toHaveLength(0);
    expect(audited).toHaveLength(0);
  });

  it("passes on the database's refusal and records nothing", async () => {
    const { write } = writer("refused");
    const result = await transitionClaim({ row: row("submitted", "2026-10-01T03:00:00Z"), move: "withdraw", actor: owner, write });
    expect(result).toEqual({ ok: false, error: "db down" });
    expect(events()).toHaveLength(0);
  });

  it("refuses an owner move on somebody else's claim", async () => {
    const { write, asked } = writer("lands");
    const stranger: ClaimActor = { ...owner, personId: "person-c" };
    expect(await transitionClaim({ row: row("submitted", "x"), move: "withdraw", actor: stranger, write })).toEqual({ ok: false, error: "Claim not found." });
    expect(asked).toHaveLength(0);
  });
});

describe("transitionClaim: decisions", () => {
  const checker = (personId: string, mayDecideOwn = false): ClaimActor => ({ kind: "checker", personId, mayDecideOwn, label: null });

  it("refuses a check of your own claim unless you may decide your own", async () => {
    const { write, asked } = writer("lands");
    expect(await transitionClaim({ row: row("submitted", "x"), move: "check", actor: checker(OWNER), write })).toEqual({
      ok: false,
      error: "You cannot check or approve your own claim.",
    });
    expect(asked).toHaveLength(0);
  });

  it("refuses to check a claim with a receipt whose rate is pending, and writes nothing", async () => {
    script(
      "reimbursement_claim_items",
      { data: [] },
      { data: [{ id: "item-1", seller: "13cabs", description: null, bought_on: "2026-10-04", amount_vnd: null, declined_at: null }] },
    );
    const { write, asked } = writer("lands");
    expect(await transitionClaim({ row: row("submitted", "x"), move: "check", actor: checker("person-finance"), write })).toEqual({
      ok: false,
      error: "13cabs · Oct 4, 2026: rate pending. Enter the rate by hand, or decline the receipt, before checking.",
    });
    expect(asked).toHaveLength(0);
    expect(events()).toHaveLength(0);
  });

  it("checks a claim whose only rate-pending receipt was declined", async () => {
    script(
      "reimbursement_claim_items",
      { data: [{ id: "item-1" }] },
      {
        data: [
          { id: "item-1", seller: "13cabs", description: null, bought_on: "2026-10-04", amount_vnd: null, declined_at: "2026-10-06T02:00:00Z" },
          { id: "item-2", seller: "Grab", description: null, bought_on: "2026-10-04", amount_vnd: 126000, declined_at: null },
        ],
      },
      OVER_LIMIT,
    );
    script("reimbursement_claim_events", { data: { id: "event-1" } });
    script("approvals", { data: { id: "approval-check", metadata: {} } }, { data: [{ id: "approval-check" }] }, { data: null }, { data: null });
    const { write } = writer("lands");
    expect(await transitionClaim({ row: row("submitted", "x"), move: "check", actor: checker("person-finance"), write })).toEqual({ ok: true });
  });

  it("refuses to check a claim whose every receipt is declined, writing nothing: the checker rejects it instead", async () => {
    script(
      "reimbursement_claim_items",
      { data: [{ id: "item-1" }] },
      { data: [{ id: "item-1", seller: "Grab", description: null, bought_on: "2026-10-04", amount_vnd: 126000, declined_at: "2026-10-06T02:00:00Z" }] },
    );
    const { write, asked } = writer("lands");
    expect(await transitionClaim({ row: row("submitted", "x"), move: "check", actor: checker("person-finance"), write })).toEqual({
      ok: false,
      error: "Every receipt is declined: reject the claim instead.",
    });
    expect(asked).toHaveLength(0);
  });

  it("checks a submitted claim: stamps who checked it, settles the check and opens the approval", async () => {
    script("reimbursement_claim_items", { data: [] }, { data: [] }, OVER_LIMIT);
    script("reimbursement_claim_events", { data: { id: "event-1" } });
    script("approvals", { data: { id: "approval-check", metadata: { label: "Check claim: Hanoi client workshop" } } }, { data: [{ id: "approval-check" }] }, { data: null }, { data: null });
    const { write, asked } = writer("lands");
    expect(await transitionClaim({ row: row("submitted", "x"), move: "check", actor: checker("person-finance"), write })).toEqual({ ok: true });
    expect(asked).toHaveLength(1);
    expect(asked[0].from).toBe("submitted");
    expect(asked[0].patch).toMatchObject({ status: "checked", checked_by: "person-finance" });
    expect(typeof asked[0].patch.checked_at).toBe("string");
    expect(events()).toEqual([expect.objectContaining({ from_status: "submitted", to_status: "checked", actor_person_id: "person-finance" })]);
    // The pending check is the one settled: read by its subject, decided by its id.
    expect(approvalReads()[0]).toEqual(expect.arrayContaining([["eq", "subject_type", "reimbursement_check"], ["eq", "subject_id", "claim-1"], ["eq", "state", "pending"]]));
    const [settle, ...rest] = approvalWrites();
    expect(settle).toMatchObject({ op: "update", payload: { state: "approved", decided_by: "person-finance" } });
    expect(settle.filters).toEqual([
      ["eq", "id", "approval-check"],
      ["eq", "state", "pending"],
    ]);
    expect(rest).toEqual([
      expect.objectContaining({
        op: "insert",
        payload: expect.objectContaining({ subject_type: "reimbursement_approval", approver_permission: "reimbursements.approve", state: "pending" }),
      }),
    ]);
    // The owner reads a check on the claim; the approvers are told it waits
    // for them (design §1.8), keyed by the history row, and never the checker.
    expect(told).toHaveLength(0);
    expect(checkedTold).toEqual([
      { claimId: "claim-1", ownerPersonId: OWNER, title: "Hanoi client workshop", checkedBy: "person-finance", eventId: "event-1" },
    ]);
  });

  // RB.22 (Dave): under the approval limit the check approves the claim in the
  // same move, by the same person, and no approver is asked.
  it("approves a claim under the limit on its check, writing both moves, and emails no approver", async () => {
    const SMALL = { data: [{ id: "item-1", amount_vnd: 640_000, declined_at: null, removed_at: null }] };
    script("reimbursement_claim_items", { data: [] }, { data: [] }, SMALL, SMALL);
    script("reimbursement_claim_events", { data: { id: "event-1" } }, { data: { id: "event-2" } });
    script(
      "approvals",
      { data: { id: "approval-check", metadata: {} } },
      { data: [{ id: "approval-check" }] },
      { data: null },
      { data: null },
      { data: { id: "approval-approve", metadata: {} } },
      { data: [{ id: "approval-approve" }] },
    );
    const { write, asked } = writer("lands");
    expect(await transitionClaim({ row: row("submitted", "x"), move: "check", actor: checker("person-finance"), write })).toEqual({ ok: true });
    expect(asked.map((a) => [a.from, a.patch.status])).toEqual([
      ["submitted", "checked"],
      ["checked", "approved"],
    ]);
    expect(asked[1].patch).toMatchObject({ approved_by: "person-finance", approved_total_vnd: 640_000 });
    expect(events()).toEqual([
      expect.objectContaining({ from_status: "submitted", to_status: "checked", actor_person_id: "person-finance" }),
      expect.objectContaining({ from_status: "checked", to_status: "approved", actor_person_id: "person-finance", metadata: { approvedTotalVnd: 640_000 } }),
    ]);
    expect(checkedTold).toHaveLength(0);
  });

  it("asks the approvers after all when a claim under the limit cannot be approved", async () => {
    const SMALL = { data: [{ id: "item-1", amount_vnd: 640_000, declined_at: null, removed_at: null }] };
    script("reimbursement_claim_items", { data: [] }, { data: [] }, SMALL, SMALL);
    script("reimbursement_claim_events", { data: { id: "event-1" } });
    script("approvals", { data: { id: "approval-check", metadata: {} } }, { data: [{ id: "approval-check" }] }, { data: null }, { data: null });
    vi.spyOn(console, "error").mockImplementation(() => {});
    // The check lands; the approval's write then finds the claim moved on.
    let writes = 0;
    const write: ClaimWriter = async () => (++writes === 1 ? { data: [{ id: "claim-1" }], error: null } : { data: [], error: null });
    expect(await transitionClaim({ row: row("submitted", "x"), move: "check", actor: checker("person-finance"), write })).toEqual({ ok: true });
    expect(checkedTold).toEqual([expect.objectContaining({ claimId: "claim-1", checkedBy: "person-finance", eventId: "event-1" })]);
  });

  it("carries the declined receipts into the check's history row and its approval", async () => {
    script("reimbursement_claim_items", { data: [{ id: "item-2" }] }, { data: [] }, OVER_LIMIT);
    script("reimbursement_claim_events", { data: { id: "event-1" } });
    script("approvals", { data: { id: "approval-check", metadata: { label: "Check claim: Hanoi client workshop" } } }, { data: [{ id: "approval-check" }] }, { data: null }, { data: null });
    const { write } = writer("lands");
    expect(await transitionClaim({ row: row("submitted", "x"), move: "check", actor: checker("person-finance"), write })).toEqual({ ok: true });
    expect(events()[0]).toMatchObject({ declined_item_ids: ["item-2"] });
    // The ids ride on the pending row that took the decision, beside what it already said.
    expect(approvalWrites()[0].payload).toMatchObject({
      state: "approved",
      metadata: { label: "Check claim: Hanoi client workshop", declinedItemIds: ["item-2"] },
    });
  });

  it("leaves a decided row when no check was pending (a claim submitted before checks were opened)", async () => {
    script("reimbursement_claim_items", { data: [] }, { data: [] }, OVER_LIMIT);
    script("reimbursement_claim_events", { data: { id: "event-1" } });
    script("approvals", { data: null }, { data: [] }, { data: null }, { data: null }, { data: null });
    const { write } = writer("lands");
    expect(await transitionClaim({ row: row("submitted", "x"), move: "check", actor: checker("person-finance"), write })).toEqual({ ok: true });
    expect(approvalWrites().map((w) => [w.op, w.payload.subject_type ?? null, w.payload.state])).toEqual([
      ["update", null, "approved"],
      ["insert", "reimbursement_check", "approved"],
      ["insert", "reimbursement_approval", "pending"],
    ]);
  });

  it.each([
    ["send_back", "sent_back"],
    ["reject", "rejected"],
  ] as const)("%s: needs a reason, settles the check as rejected with the outcome, and emails the owner", async (move, became) => {
    const { write, asked } = writer("lands");
    expect(await transitionClaim({ row: row("submitted", "x"), move, actor: checker("person-finance"), write, reason: "  " })).toEqual({
      ok: false,
      error: "Give a reason.",
    });
    expect(asked).toHaveLength(0);

    script("reimbursement_claim_items", { data: [] });
    script("reimbursement_claim_events", { data: { id: "event-7" } });
    script("approvals", { data: { id: "approval-check", metadata: {} } }, { data: [{ id: "approval-check" }] });
    expect(await transitionClaim({ row: row("submitted", "x"), move, actor: checker("person-finance"), write, reason: " The taxi receipt is unreadable. " })).toEqual({
      ok: true,
    });
    expect(asked).toEqual([{ patch: { status: became }, from: "submitted" }]);
    expect(events()).toEqual([expect.objectContaining({ to_status: became, reason: "The taxi receipt is unreadable.", actor_person_id: "person-finance" })]);
    const [settle] = approvalWrites();
    expect(settle.payload).toMatchObject({ state: "rejected", decided_by: "person-finance", reason: "The taxi receipt is unreadable.", metadata: { outcome: became } });
    expect(approvalReads()[0]).toEqual(expect.arrayContaining([["eq", "subject_type", "reimbursement_check"]]));
    expect(told).toEqual([
      { claimId: "claim-1", ownerPersonId: OWNER, title: "Hanoi client workshop", became, step: "check", reason: "The taxi receipt is unreadable.", eventId: "event-7" },
    ]);
  });

  it("refuses a second check of a claim already checked, writing and recording nothing", async () => {
    const { write, asked } = writer("lands");
    expect(await transitionClaim({ row: row("checked", "x"), move: "check", actor: checker("person-d"), write })).toEqual({
      ok: false,
      error: "This claim is already checked.",
    });
    expect(asked).toHaveLength(0);
    expect(events()).toHaveLength(0);
    expect(approvalWrites()).toHaveLength(0);
  });

  it("refuses every decision on your own claim, not only the check", async () => {
    const { write, asked } = writer("lands");
    for (const move of ["send_back", "reject"] as const) {
      expect(await transitionClaim({ row: row("submitted", "x"), move, actor: checker(OWNER), write, reason: "why" })).toEqual({
        ok: false,
        error: "You cannot check or approve your own claim.",
      });
    }
    expect(asked).toHaveLength(0);
  });

  const approver = (personId: string, mayDecideOwn = false): ClaimActor => ({ kind: "approver", personId, mayDecideOwn, label: null });

  it("approves a checked claim: freezes the total of the kept receipts, settles the approval, and records the total", async () => {
    script("reimbursement_claim_items", {
      data: [
        { id: "item-1", amount_vnd: 126000, declined_at: null },
        { id: "item-2", amount_vnd: 900000, declined_at: "2026-10-02T04:00:00Z" },
        { id: "item-3", amount_vnd: 74000, declined_at: null },
      ],
    });
    script("reimbursement_claim_events", { data: { id: "event-9" } });
    script("approvals", { data: { id: "approval-approve", metadata: { label: "Approve claim: Hanoi client workshop" } } }, { data: [{ id: "approval-approve" }] });
    const { write, asked } = writer("lands");
    expect(await transitionClaim({ row: row("checked", "x"), move: "approve", actor: approver("person-employer"), write })).toEqual({ ok: true });
    expect(asked).toHaveLength(1);
    expect(asked[0].from).toBe("checked");
    expect(asked[0].patch).toMatchObject({ status: "approved", approved_by: "person-employer", approved_total_vnd: 200000 });
    expect(typeof asked[0].patch.approved_at).toBe("string");
    expect(events()).toEqual([
      expect.objectContaining({
        from_status: "checked",
        to_status: "approved",
        actor_person_id: "person-employer",
        declined_item_ids: ["item-2"],
        metadata: { approvedTotalVnd: 200000 },
      }),
    ]);
    // The approval that was waiting is the one settled, with the frozen total on it.
    expect(approvalReads()[0]).toEqual(expect.arrayContaining([["eq", "subject_type", "reimbursement_approval"], ["eq", "subject_id", "claim-1"], ["eq", "state", "pending"]]));
    const writes = approvalWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      op: "update",
      payload: { state: "approved", decided_by: "person-employer", metadata: { approvedTotalVnd: 200000, declinedItemIds: ["item-2"] } },
    });
    // Approved, the owner reads it on the claim; nobody is emailed (design §1.8).
    expect(told).toHaveLength(0);
    expect(checkedTold).toHaveLength(0);
  });

  it("refuses to approve a claim at 0 ₫ because every receipt is declined, writing nothing", async () => {
    script("reimbursement_claim_items", {
      data: [
        { id: "item-1", amount_vnd: 126000, declined_at: "2026-10-02T04:00:00Z" },
        { id: "item-2", amount_vnd: 74000, declined_at: "2026-10-02T04:00:00Z" },
      ],
    });
    const { write, asked } = writer("lands");
    expect(await transitionClaim({ row: row("checked", "x"), move: "approve", actor: approver("person-employer"), write })).toEqual({
      ok: false,
      error: "Every receipt is declined: reject the claim instead.",
    });
    expect(asked).toHaveLength(0);
    expect(events()).toHaveLength(0);
  });

  it("refuses to approve while a kept receipt has no VND amount, writing nothing", async () => {
    script("reimbursement_claim_items", {
      data: [
        { id: "item-1", amount_vnd: 126000, declined_at: null },
        { id: "item-2", amount_vnd: null, declined_at: null },
      ],
    });
    const { write, asked } = writer("lands");
    expect(await transitionClaim({ row: row("checked", "x"), move: "approve", actor: approver("person-employer"), write })).toEqual({
      ok: false,
      error: "A receipt on this claim has no amount in VND yet, so its total cannot be approved.",
    });
    expect(asked).toHaveLength(0);
    expect(events()).toHaveLength(0);
  });

  it("approves your own claim only with the employer's exemption", async () => {
    const { write, asked } = writer("lands");
    expect(await transitionClaim({ row: row("checked", "x"), move: "approve", actor: approver(OWNER), write })).toEqual({
      ok: false,
      error: "You cannot check or approve your own claim.",
    });
    expect(asked).toHaveLength(0);
    script("reimbursement_claim_items", { data: [{ id: "item-1", amount_vnd: 126000, declined_at: null }] });
    script("reimbursement_claim_events", { data: { id: "event-9" } });
    script("approvals", { data: { id: "approval-approve", metadata: {} } }, { data: [{ id: "approval-approve" }] });
    expect(await transitionClaim({ row: row("checked", "x"), move: "approve", actor: approver(OWNER, true), write })).toEqual({ ok: true });
    expect(asked[0].patch).toMatchObject({ status: "approved", approved_by: OWNER, approved_total_vnd: 126000 });
  });

  it.each([
    ["send_back", "sent_back"],
    ["reject", "rejected"],
  ] as const)("the approver's %s settles the approval as rejected and emails the owner from the approval step", async (move, became) => {
    script("reimbursement_claim_items", { data: [] });
    script("reimbursement_claim_events", { data: { id: "event-8" } });
    script("approvals", { data: { id: "approval-approve", metadata: {} } }, { data: [{ id: "approval-approve" }] });
    const { write, asked } = writer("lands");
    expect(await transitionClaim({ row: row("checked", "x"), move, actor: approver("person-employer"), write, reason: "Not a business cost." })).toEqual({ ok: true });
    expect(asked).toEqual([{ patch: { status: became }, from: "checked" }]);
    expect(approvalReads()[0]).toEqual(expect.arrayContaining([["eq", "subject_type", "reimbursement_approval"]]));
    expect(approvalWrites()[0].payload).toMatchObject({ state: "rejected", decided_by: "person-employer", metadata: { outcome: became } });
    expect(told).toEqual([
      { claimId: "claim-1", ownerPersonId: OWNER, title: "Hanoi client workshop", became, step: "approval", reason: "Not a business cost.", eventId: "event-8" },
    ]);
  });

  it("refuses an approval of a claim nobody has checked", async () => {
    const { write, asked } = writer("lands");
    expect(await transitionClaim({ row: row("submitted", "x"), move: "approve", actor: approver("person-employer"), write })).toEqual({
      ok: false,
      error: "A submitted claim cannot be moved this way.",
    });
    expect(asked).toHaveLength(0);
  });

  it("emails nobody when the decision lost the race", async () => {
    script("reimbursement_claim_items", { data: [] });
    const { write } = writer("matches nothing");
    const result = await transitionClaim({ row: row("submitted", "x"), move: "reject", actor: checker("person-finance"), write, reason: "why" });
    expect(result.ok).toBe(false);
    expect(told).toHaveLength(0);
    expect(approvalWrites()).toHaveLength(0);
  });
});

describe("declineClaimItem", () => {
  const finance: ClaimActor = { kind: "checker", personId: "person-finance", mayDecideOwn: false, label: "Finley" };
  const itemWrites = () => calls.filter((c) => c.table === "reimbursement_claim_items" && c.ops[0] === "update");

  it("declines one receipt of a submitted claim with its reason, on that claim only", async () => {
    script("reimbursement_claim_items", { data: [{ id: "item-2" }] });
    expect(await declineClaimItem({ row: row("submitted", "x"), itemId: "item-2", actor: finance, reason: " Personal dinner " })).toEqual({ ok: true });
    const [w] = itemWrites();
    expect(w.payloads[0]).toMatchObject({ declined_by: "person-finance", decline_reason: "Personal dinner" });
    expect(typeof (w.payloads[0] as Record<string, unknown>).declined_at).toBe("string");
    // Never a receipt its owner removed (20261008090000): it counts toward
    // nothing, so there is nothing to decline.
    expect(w.filters).toEqual([
      ["eq", "id", "item-2"],
      ["eq", "claim_id", "claim-1"],
      ["is", "removed_at", null],
    ]);
  });

  it("restores a declined receipt, clearing all three columns together", async () => {
    script("reimbursement_claim_items", { data: [{ id: "item-2" }] });
    expect(await declineClaimItem({ row: row("submitted", "x"), itemId: "item-2", actor: finance, reason: null })).toEqual({ ok: true });
    expect(itemWrites()[0].payloads[0]).toEqual({ declined_at: null, declined_by: null, decline_reason: null });
  });

  it("refuses without writing: a claim not waiting to be checked, your own claim, a missing reason, a receipt not on the claim", async () => {
    expect(await declineClaimItem({ row: row("checked", "x"), itemId: "item-2", actor: finance, reason: "x" })).toEqual({
      ok: false,
      error: "Receipts can be declined only while the claim waits to be checked.",
    });
    expect(await declineClaimItem({ row: row("submitted", "x"), itemId: "item-2", actor: { ...finance, personId: OWNER }, reason: "x" })).toEqual({
      ok: false,
      error: "You cannot check or approve your own claim.",
    });
    expect(await declineClaimItem({ row: row("submitted", "x"), itemId: "item-2", actor: owner, reason: "x" })).toEqual({
      ok: false,
      error: "Only a checker can decline a receipt.",
    });
    expect(await declineClaimItem({ row: row("submitted", "x"), itemId: "item-2", actor: finance, reason: "  " })).toEqual({ ok: false, error: "Give a reason." });
    expect(itemWrites()).toHaveLength(0);
    script("reimbursement_claim_items", { data: [] });
    expect(await declineClaimItem({ row: row("submitted", "x"), itemId: "item-9", actor: finance, reason: "x" })).toEqual({
      ok: false,
      error: "That receipt is no longer on the claim, or its owner removed it.",
    });
  });

  // A.34: the claim was submitted when it was read, and another checker
  // checked it before this decline landed. The database refuses a checked
  // claim's receipt; the checker is told why, not shown a raw error.
  it("says so when the claim was checked while the checker was working", async () => {
    // The fake's error type names only `message`; PostgREST's carries the SQLSTATE as `code` too.
    const frozen = { message: "Claim claim-1 is checked: its receipts are frozen once it is checked.", code: "P0R01" } as { message: string };
    script("reimbursement_claim_items", { data: null, error: frozen });
    expect(await declineClaimItem({ row: row("submitted", "x"), itemId: "item-2", actor: finance, reason: "x" })).toEqual({
      ok: false,
      error: "This claim was checked while you were working on it, so the receipt stays as it was. Reload to see it.",
    });
  });
});

describe("claimWriterFor", () => {
  it("guards the update on the claim, its owner and the status it was read in, and asks for the rows back", async () => {
    script("reimbursement_claims", { data: [{ id: "claim-1" }] });
    await claimWriterFor("claim-1", { ownedBy: OWNER })({ status: "draft" }, "submitted");
    const [update] = calls.filter((c) => c.table === "reimbursement_claims");
    expect(update.ops[0]).toBe("update");
    expect(update.payloads[0]).toEqual({ status: "draft" });
    expect(update.filters).toEqual([
      ["eq", "id", "claim-1"],
      ["eq", "person_id", OWNER],
      ["eq", "status", "submitted"],
    ]);
    expect(update.ops.at(-1)).toBe("select");
  });
});

describe("createClaim", () => {
  it("inserts a draft for the owner and records that it was started", async () => {
    script("reimbursement_claims", { data: { id: "claim-9" } });
    script("reimbursement_claim_events", { data: null });
    const result = await createClaim({ title: "  Hanoi client workshop ", owner: { personId: OWNER, teamMemberId: "tm-a" }, actor: owner });
    expect(result).toEqual({ ok: true, id: "claim-9" });
    const insert = calls.find((c) => c.table === "reimbursement_claims");
    expect(insert?.payloads[0]).toEqual({ title: "Hanoi client workshop", person_id: OWNER, team_member_id: "tm-a", status: "draft" });
    expect(events()).toEqual([expect.objectContaining({ claim_id: "claim-9", from_status: null, to_status: "draft", actor_person_id: OWNER })]);
  });

  it("names the trip the New claim page picked (RB.11)", async () => {
    script("reimbursement_claims", { data: { id: "claim-9" } });
    script("reimbursement_claim_events", { data: null });
    await createClaim({ title: "Australia trip – taxis", tripEventId: "ev-1", owner: { personId: OWNER, teamMemberId: "tm-a" }, actor: owner });
    const insert = calls.find((c) => c.table === "reimbursement_claims");
    expect(insert?.payloads[0]).toMatchObject({ title: "Australia trip – taxis", trip_event_id: "ev-1", status: "draft" });
  });

  it("refuses a blank title without touching the database", async () => {
    expect(await createClaim({ title: "  ", owner: { personId: OWNER, teamMemberId: "tm-a" }, actor: owner })).toEqual({
      ok: false,
      error: "Give the claim a title.",
    });
    expect(calls).toHaveLength(0);
  });
});

describe("deleteDraftClaim", () => {
  it("deletes a never-submitted draft of the owner's, guarded in the delete itself", async () => {
    script("reimbursement_files", { data: [] });
    script("reimbursement_claims", { data: [{ id: "claim-1" }] });
    expect(await deleteDraftClaim({ row: row("draft"), actor: owner })).toEqual({ ok: true });
    const del = calls.find((c) => c.table === "reimbursement_claims");
    expect(del?.ops[0]).toBe("delete");
    expect(del?.filters).toEqual([
      ["eq", "id", "claim-1"],
      ["eq", "person_id", OWNER],
      ["eq", "status", "draft"],
      ["is", "submitted_at", null],
    ]);
  });

  it("refuses a withdrawn draft: once submitted, a claim is kept", async () => {
    expect(await deleteDraftClaim({ row: row("draft", "2026-10-01T03:00:00Z"), actor: owner })).toEqual({
      ok: false,
      error: "This claim was submitted once, so it is kept for ten years and cannot be deleted.",
    });
    expect(calls).toHaveLength(0);
  });

  it("answers that the claim changed when the guarded delete matched nothing", async () => {
    script("reimbursement_files", { data: [] });
    script("reimbursement_claims", { data: [] });
    expect(await deleteDraftClaim({ row: row("draft"), actor: owner })).toEqual({
      ok: false,
      error: "This claim changed while you were working on it. Reload and try again.",
    });
  });
});

describe("transitionClaim: what a landed move announces (RB.8)", () => {
  const finance: ClaimActor = { kind: "checker", personId: "person-finance", mayDecideOwn: false, label: "Finley" };
  const employer: ClaimActor = { kind: "approver", personId: "person-employer", mayDecideOwn: false, label: "Drew" };

  it("tells the Operations chat and accounting@ of a submission, and states claim.submitted", async () => {
    scriptSubmittable();
    script("reimbursement_claim_events", { data: { id: "event-1" } });
    script("approvals", { data: null }, { data: null });
    const { write } = writer("lands");
    expect(await transitionClaim({ row: row("draft"), move: "submit", actor: owner, write })).toEqual({ ok: true });
    expect(submissionTold).toEqual([{ claimId: "claim-1", ownerPersonId: OWNER, title: "Hanoi client workshop", receipts: 1, resubmitted: false, eventId: "event-1" }]);
    expect(published).toEqual([
      { name: "claim.submitted", payload: { claimId: "claim-1", ownerPersonId: OWNER, title: "Hanoi client workshop", receipts: 1, resubmitted: false, actorPersonId: OWNER } },
    ]);
  });

  it("states a send back with its reason, for the owner's inbox", async () => {
    script("reimbursement_claim_items", { data: [] });
    script("reimbursement_claim_events", { data: { id: "event-4" } });
    script("approvals", { data: { id: "approval-check", metadata: {} } }, { data: [{ id: "approval-check" }] });
    const { write } = writer("lands");
    expect(await transitionClaim({ row: row("submitted", "x"), move: "send_back", actor: finance, write, reason: "Blurry receipt" })).toEqual({ ok: true });
    expect(published).toEqual([
      {
        name: "claim.decided",
        payload: expect.objectContaining({ claimId: "claim-1", ownerPersonId: OWNER, became: "sent_back", reason: "Blurry receipt", runDate: null, eventId: "event-4", actorPersonId: "person-finance" }),
      },
    ]);
  });

  it("states an approval with the frozen total and the run that will pay it", async () => {
    script("reimbursement_claim_items", { data: [{ id: "item-1", amount_vnd: 126000, declined_at: null }] });
    script("reimbursement_claim_events", { data: { id: "event-9" } });
    script("approvals", { data: { id: "approval-approve", metadata: {} } }, { data: [{ id: "approval-approve" }] });
    const { write } = writer("lands");
    expect(await transitionClaim({ row: row("checked", "x"), move: "approve", actor: employer, write })).toEqual({ ok: true });
    const decided = published[0];
    expect(decided).toMatchObject({ name: "claim.decided", payload: { became: "approved", approvedTotalVnd: 126000, reason: null } });
    expect(String(decided.payload.runDate)).toMatch(/^\d{4}-\d{2}-(01|15)$/);
  });

  it("announces nothing when the guarded write matched nothing", async () => {
    script("reimbursement_claim_items", { data: [] });
    const { write } = writer("matches nothing");
    await transitionClaim({ row: row("submitted", "x"), move: "reject", actor: finance, write, reason: "why" });
    expect(published).toEqual([]);
    expect(submissionTold).toEqual([]);
  });

  it("states a payment returned to approved as a decision the owner reads, with its reason and the next run", async () => {
    script("reimbursement_claim_events", { data: { id: "event-20" } });
    const { write } = writer("lands");
    const payer: ClaimActor = { kind: "payer", personId: "person-finance", mayDecideOwn: false, label: "Finley" };
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T05:00:00Z"));
    try {
      expect(
        await transitionClaim({ row: row("in_run", "x"), move: "return_to_approved", actor: payer, write, reason: "Account number rejected", runId: "run-15", paymentId: "pay-1" }),
      ).toEqual({ ok: true });
    } finally {
      vi.useRealTimers();
    }
    expect(published).toEqual([
      {
        name: "claim.decided",
        payload: {
          claimId: "claim-1",
          ownerPersonId: OWNER,
          title: "Hanoi client workshop",
          became: "returned",
          reason: "Account number rejected",
          approvedTotalVnd: null,
          runDate: "2026-11-01",
          eventId: "event-20",
          actorPersonId: "person-finance",
        },
      },
    ]);
  });

  it("states a claim entering a run", async () => {
    script("reimbursement_claim_events", { data: { id: "event-12" } });
    const { write } = writer("lands");
    const cron: ClaimActor = { kind: "cron", personId: null, mayDecideOwn: false };
    await transitionClaim({ row: row("approved", "x"), move: "enter_run", actor: cron, write, runId: "run-15" });
    expect(published).toEqual([{ name: "claim.in_run", payload: { claimId: "claim-1", ownerPersonId: OWNER, title: "Hanoi client workshop", runId: "run-15", eventId: "event-12" } }]);
  });
});

describe("transitionClaim: the payment run's move (RB.6)", () => {
  const cron: ClaimActor = { kind: "cron", personId: null, mayDecideOwn: false, label: "cron:payment-run" };

  it("puts an approved claim in its run: links the run, stamps in_run_at, records the run on the history row", async () => {
    script("reimbursement_claim_events", { data: { id: "event-1" } });
    const { write, asked } = writer("lands");
    expect(await transitionClaim({ row: row("approved", "2026-10-01T03:00:00Z"), move: "enter_run", actor: cron, write, runId: "run-15" })).toEqual({ ok: true });
    expect(asked).toHaveLength(1);
    expect(asked[0].from).toBe("approved");
    expect(asked[0].patch).toMatchObject({ status: "in_run", payment_run_id: "run-15" });
    expect(typeof asked[0].patch.in_run_at).toBe("string");
    expect(events()).toEqual([expect.objectContaining({ from_status: "approved", to_status: "in_run", actor_person_id: null, metadata: { runId: "run-15" } })]);
    // Entering a run is not a decision: no approval is written.
    expect(approvalWrites()).toEqual([]);
  });

  it("is a no-op for a claim already in the run, so a rerun of the cron moves nothing twice", async () => {
    const { write, asked } = writer("lands");
    expect(await transitionClaim({ row: row("in_run", "2026-10-01T03:00:00Z"), move: "enter_run", actor: cron, write, runId: "run-15" })).toEqual({ ok: true });
    expect(asked).toHaveLength(0);
    expect(events()).toEqual([]);
  });

  it("refuses anyone but the run to put a claim in a run, and the run without saying which", async () => {
    const payer: ClaimActor = { kind: "payer", personId: "person-finance", mayDecideOwn: false };
    const { write, asked } = writer("lands");
    expect(await transitionClaim({ row: row("approved"), move: "enter_run", actor: payer, write, runId: "run-15" })).toEqual({
      ok: false,
      error: "Only the payment run puts a claim in a run.",
    });
    expect(await transitionClaim({ row: row("approved"), move: "enter_run", actor: cron, write })).toEqual({
      ok: false,
      error: "A claim enters a run only with the run it enters.",
    });
    expect(asked).toHaveLength(0);
  });
});

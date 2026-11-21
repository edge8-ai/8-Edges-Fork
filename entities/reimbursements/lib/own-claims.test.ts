import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The owner's write gate (A.37). Every write an owner makes to a claim's
// receipts, documents or trip opens its target here first: the read scoped to
// the owner, the lock, and for a removal whether the claim deletes or marks.
// Before A.37 each of nine writes assembled those steps itself.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());

import { openForOwner } from "./own-claims";

const OWNER = "person-a";
const SUBMITTED_BEFORE = "2026-10-01T03:00:00Z";
const claim = (status = "draft", submitted_at: string | null = null) => ({ id: "claim-1", status, person_id: OWNER, title: "Trip", submitted_at });
const item = (c = claim()) => ({ data: { id: "item-1", removed_at: null, currency: "vnd", reimbursement_claims: c } });
const file = (c = claim(), confirmed_at: string | null = "2026-10-02T03:00:00Z") => ({
  data: {
    id: "file-1",
    kind: "receipt",
    storage_path: "claim/claim-1/item-1/file-1.pdf",
    filename: "file-1.pdf",
    confirmed_at,
    claim_item_id: "item-1",
    reimbursement_claim_items: { reimbursement_claims: c },
  },
});

beforeEach(() => resetFake());

describe("openForOwner", () => {
  it("opens an item of an open claim for an edit, reading only the owner's claims", async () => {
    script("reimbursement_claim_items", item());

    const opened = await openForOwner({ itemId: "item-1" }, OWNER, "edit");

    expect(opened).toEqual({ ok: true, value: { id: "item-1", removed: false, currency: "vnd", claim: expect.objectContaining({ id: "claim-1", status: "draft" }) } });
    expect(calls[0].filters).toContainEqual(["eq", "reimbursement_claims.person_id", OWNER]);
  });

  it("reads another person's claim as not found", async () => {
    script("reimbursement_claims", { data: null });

    await expect(openForOwner({ claimId: "claim-9" }, OWNER, "edit")).resolves.toEqual({ ok: false, error: "Claim not found." });
  });

  it("refuses a checked claim's documents in the words its badge uses", async () => {
    script("reimbursement_files", file(claim("checked", SUBMITTED_BEFORE)));

    await expect(openForOwner({ fileId: "file-1" }, OWNER, "edit")).resolves.toEqual({
      ok: false,
      error: "This claim is waiting for approval, so its documents are kept as they are.",
    });
  });

  it("deletes a receipt only from a draft never submitted, and marks it removed only from a claim submitted before", async () => {
    script("reimbursement_claim_items", item(claim("sent_back", SUBMITTED_BEFORE)), item(claim("draft")));

    await expect(openForOwner({ itemId: "item-1" }, OWNER, "delete")).resolves.toEqual({
      ok: false,
      error: "This claim was submitted before, so its receipts are kept for ten years: remove this one with a reason instead.",
    });
    await expect(openForOwner({ itemId: "item-1" }, OWNER, "mark")).resolves.toEqual({
      ok: false,
      error: "This draft was never submitted, so the receipt can simply be deleted.",
    });
  });

  it("removes an upload that never finished from any claim the owner may change, but keeps a confirmed document of a claim submitted before", async () => {
    const reopened = claim("sent_back", SUBMITTED_BEFORE);
    script("reimbursement_files", file(reopened, null), file(reopened));

    await expect(openForOwner({ fileId: "file-1" }, OWNER, "delete")).resolves.toMatchObject({ ok: true });
    await expect(openForOwner({ fileId: "file-1" }, OWNER, "delete")).resolves.toEqual({
      ok: false,
      error: "This claim was submitted before, so its documents are kept for ten years: mark this one replaced instead, then add the new one.",
    });
  });

  it("opens a document already confirmed for a repeated confirm whatever the claim's lock, and locks one still arriving", async () => {
    // A second confirm only hands back the document's kind (RB.20), so it
    // passes on a claim the owner can no longer change; a first one does not.
    const submitted = claim("submitted", SUBMITTED_BEFORE);
    script("reimbursement_files", file(submitted), file(submitted, null));

    await expect(openForOwner({ fileId: "file-1" }, OWNER, "confirm")).resolves.toMatchObject({ ok: true, value: { confirmed: true } });
    await expect(openForOwner({ fileId: "file-1" }, OWNER, "confirm")).resolves.toEqual({ ok: false, error: "This claim is submitted. Withdraw it to change it." });
  });

  it("opens the owner's own document to read on any claim, and another person's as not found", async () => {
    // A download of a paid claim's receipt changes nothing, so no lock applies.
    script("reimbursement_files", file(claim("paid", SUBMITTED_BEFORE)), { data: null });

    await expect(openForOwner({ fileId: "file-1" }, OWNER, "read")).resolves.toMatchObject({ ok: true, value: { id: "file-1" } });
    await expect(openForOwner({ fileId: "file-9" }, OWNER, "read")).resolves.toEqual({ ok: false, error: "Claim not found." });
  });

  it("marks a document replaced only on a claim submitted before", async () => {
    script("reimbursement_files", file(claim("draft")));

    await expect(openForOwner({ fileId: "file-1" }, OWNER, "mark")).resolves.toEqual({
      ok: false,
      error: "This draft was never submitted, so the document can simply be removed.",
    });
  });
});

describe("openForOwner's lock", () => {
  // Every status, through the gate itself: the lock is private to it, so a
  // write cannot build its own (A.37).
  const lockOf = async (status: string) => {
    script("reimbursement_claims", { data: claim(status, status === "draft" ? null : SUBMITTED_BEFORE) });
    const opened = await openForOwner({ claimId: "claim-1" }, OWNER, "edit");
    return opened.ok ? null : opened.error;
  };

  it("lets the owner change a draft or a sent-back claim", async () => {
    expect(await lockOf("draft")).toBeNull();
    expect(await lockOf("sent_back")).toBeNull();
  });

  it("tells the owner of a submitted claim to withdraw it first", async () => {
    expect(await lockOf("submitted")).toBe("This claim is submitted. Withdraw it to change it.");
  });

  // A checked claim's badge reads Submitted, and the lock used to say
  // "This claim is checked", a word the owner never sees anywhere (A.37).
  it("says a checked claim is waiting for approval, never that it is checked", async () => {
    expect(await lockOf("checked")).toBe("This claim is waiting for approval, so its documents are kept as they are.");
  });

  it("names every later status as its badge does, in a sentence", async () => {
    expect(await lockOf("approved")).toBe("This claim is approved, so its documents are kept as they are.");
    expect(await lockOf("in_run")).toBe("This claim is in a payment run, so its documents are kept as they are.");
    expect(await lockOf("paid")).toBe("This claim is paid, so its documents are kept as they are.");
    expect(await lockOf("rejected")).toBe("This claim is rejected, so its documents are kept as they are.");
  });
});

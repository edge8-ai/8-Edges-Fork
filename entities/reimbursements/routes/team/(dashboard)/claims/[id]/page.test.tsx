import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { answerOnlySelectedColumns, calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The owner's page for one claim, rendered through the real reads (readMyClaim,
// readOwnBankDetails, readRedInvoiceBuyer) on the kernel's fake, which answers
// only the columns each read selected. Two promises are pinned here.
//
// RB.2.2: Submit is offered exactly when the submit action would accept, so the
// page decides on the same facts the action reads: a red invoice counts only
// as a confirmed PDF, and the type reaches the rule through the page's own
// read. A read or a mapping that loses the type would leave every Vietnamese
// receipt "needing its red invoice" and nobody able to submit a dong claim.
//
// RB.5.3, the owner's half: the claim is read for its owner only, and the bank
// details on it are the signed-in person's own, whatever claim the page was
// handed. The other two readers RB.5.3 allows are not on this page: a Super
// Admin's view of a person's record (crm's SensitiveDetails) and the payer's
// audited read of a run's people (RB.6). The checker's page reads no bank
// details at all (finance/claims/[id]/page.test.tsx).
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const asked = vi.hoisted(() => [] as string[]);
const viewer = vi.hoisted(() => ({ personId: "person-a" }));
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: async (p: string) => void asked.push(p) }));
vi.mock("@/kernel/identity/team-auth", () => ({ requireTeamMember: async () => ({ personId: viewer.personId }) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push() {}, refresh() {} }),
}));
// The three client islands are stubbed to record what the page hands them.
type Moves = { claimId: string; can: { submit: boolean; withdraw: boolean; delete: boolean }; blockers: string[]; resubmit: boolean };
const moves = vi.hoisted(() => [] as Moves[]);
vi.mock("./ClaimMoves", () => ({ ClaimMoves: (p: Moves) => (moves.push(p), null) }));
type Bank = { details: { bankName: string; accountNumber: string; branch: string } | null; claimId: string; confirmedAt: string | null; confirmable: boolean };
const bank = vi.hoisted(() => [] as Bank[]);
vi.mock("./BankDetailsPanel", () => ({ BankDetailsPanel: (p: Bank) => (bank.push(p), null) }));
type Items = { companies: { id: string; name: string }[]; removal: "delete" | "mark" | null };
const items = vi.hoisted(() => [] as Items[]);
vi.mock("./ClaimItems", () => ({ ClaimItems: (p: Items) => (items.push(p), null) }));
type TripIsland = { claimId: string; trips: { id: string; title: string }[]; current: { id: string; title: string } | null };
const tripIslands = vi.hoisted(() => [] as TripIsland[]);
vi.mock("./ClaimTrip", () => ({ ClaimTrip: (p: TripIsland) => (tripIslands.push(p), null) }));

import MyClaimPage from "./page";

const OWNER = "person-a";
const CLAIM = "22222222-2222-4222-8222-222222222222";
// A made-up account number, held in a constant so no fixture writes one as a
// quoted literal beside its column name (the public fork's scanner refuses it).
const ACCOUNT = "19034567";

const BANK_ON_FILE = { bank_name: "Techcombank", bank_account_number: ACCOUNT, bank_branch: null, person_id: OWNER };

const claimRow = (over: Record<string, unknown> = {}) => ({
  id: CLAIM,
  title: "Da Nang client visit",
  status: "draft",
  person_id: OWNER,
  submitted_at: null,
  approved_total_vnd: null,
  approved_at: null,
  paid_at: null,
  created_at: "2026-10-05T03:00:00Z",
  ...over,
});

/** A draft with one taxi bought in Vietnam and paid in dong, and the given confirmed documents on it. */
function scriptDraft(
  documents: { kind: string; mime_type: string; filename: string; replaced_at?: string | null }[],
  claim = claimRow(),
  bankRow: Record<string, unknown> | null = BANK_ON_FILE,
  extraItems: Record<string, unknown>[] = [],
) {
  script("reimbursement_claims", { data: [claim] });
  script("reimbursement_claim_items", {
    data: [
      {
        id: "item-1",
        description: null,
        // Not a ride: transport needs no invoice (RB.15), so the red-invoice
        // rule is proved on a hotel.
        seller: "Hotel Nikko",
        bought_on: "2026-10-04",
        category: "accommodation",
        amount_cents: 245000,
        currency: "vnd",
        amount_vnd: 245000,
        declined_at: null,
        bought_in_vietnam: true,
        lost_receipt_note: null,
        decline_reason: null,
        position: 1,
      },
      ...extraItems,
    ],
  });
  script("reimbursement_claim_events", { data: [] });
  script("reimbursement_files", {
    data: documents.map((d, i) => ({ id: `file-${i + 1}`, claim_item_id: "item-1", size_bytes: 1000, confirmed_at: "2026-10-04T05:00:00Z", storage_path: `claim/${CLAIM}/item-1/${d.filename}`, ...d })),
  });
  script("people_sensitive", { data: bankRow });
  script("legal_entities", { data: [{ slug: "acme-vn", name: "Acme Vietnam", legal_name: "Acme Vietnam Co., Ltd", tax_id: null }] });
  // The trips to pick from and the clients to rebill are read only while the
  // claim is the owner's to change.
  if (claim.status === "draft" || claim.status === "sent_back") {
    script("events", { data: [AUSTRALIA] });
    script("companies", { data: [{ id: "co-acme", name: "Acme Pty Ltd" }] });
  }
}

const AUSTRALIA = { id: "ev-1", title: "Australia trip", type: "private_trip", starts_at: "2026-10-02T00:00:00+07:00", ends_at: "2026-10-09T00:00:00+07:00" };

const RED_INVOICE = { kind: "red_invoice", mime_type: "application/pdf", filename: "HD-0412.pdf" };
const PHOTO = { kind: "receipt", mime_type: "image/jpeg", filename: "taxi.jpg" };

const render = async (id = CLAIM) => renderToStaticMarkup(await MyClaimPage({ params: Promise.resolve({ id }) }));
const filtersOn = (table: string) => calls.filter((c) => c.table === table).map((c) => c.filters);

beforeEach(() => {
  resetFake();
  answerOnlySelectedColumns();
  asked.length = 0;
  moves.length = 0;
  bank.length = 0;
  items.length = 0;
  tripIslands.length = 0;
  viewer.personId = OWNER;
});

describe("/team/claims/[id]: Submit and the red invoice (RB.2.2)", () => {
  it("offers Submit, with nothing blocking, when the Vietnamese receipt has its red invoice PDF", async () => {
    scriptDraft([RED_INVOICE]);
    await render();
    expect(asked).toEqual(["reimbursements.mine"]);
    expect(moves).toEqual([{ claimId: CLAIM, can: { submit: true, withdraw: false, delete: true }, blockers: [], resubmit: false }]);
  });

  it("keeps Submit blocked, and says why, when the only document is a photo", async () => {
    scriptDraft([PHOTO]);
    await render();
    expect(moves).toHaveLength(1);
    expect(moves[0].blockers).toEqual([expect.stringContaining("a photo is a receipt, not a red invoice")]);
  });
});

// Plan §10, 20261008090000: nothing ever submitted is deleted. The page hands
// the receipts the way this claim takes one off, from the same rule the
// actions and the database apply, and Submit reads removed receipts and
// replaced documents the way the submit action does.
describe("/team/claims/[id]: removed receipts and replaced documents", () => {
  const SUBMITTED_ONCE = "2026-10-05T04:00:00Z";

  it("deletes from a draft never submitted, marks on a sent-back or withdrawn claim, and offers neither once it is locked", async () => {
    scriptDraft([RED_INVOICE]);
    await render();
    scriptDraft([RED_INVOICE], claimRow({ status: "sent_back", submitted_at: SUBMITTED_ONCE }));
    await render();
    scriptDraft([RED_INVOICE], claimRow({ submitted_at: SUBMITTED_ONCE }));
    await render();
    scriptDraft([RED_INVOICE], claimRow({ status: "submitted", submitted_at: SUBMITTED_ONCE }));
    await render();
    expect(items.map((i) => i.removal)).toEqual(["delete", "mark", "mark", null]);
  });

  it("keeps Submit blocked when the red invoice was replaced and nothing took its place", async () => {
    scriptDraft([{ ...RED_INVOICE, replaced_at: "2026-10-06T03:00:00Z" }], claimRow({ status: "sent_back", submitted_at: SUBMITTED_ONCE }));
    await render();
    expect(moves[0].blockers).toEqual([expect.stringContaining("needs its red invoice")]);
  });

  it("asks nothing of a removed receipt before Submit", async () => {
    const removed = { id: "item-2", description: null, seller: "Grab", bought_on: null, category: "transport", amount_cents: 0, currency: "vnd", amount_vnd: 0, declined_at: null, bought_in_vietnam: true, lost_receipt_note: null, decline_reason: null, position: 2, removed_at: "2026-10-06T03:00:00Z", remove_reason: "Charged twice" };
    scriptDraft([RED_INVOICE], claimRow({ status: "sent_back", submitted_at: SUBMITTED_ONCE }), BANK_ON_FILE, [removed]);
    await render();
    expect(moves[0].blockers).toEqual([]);
  });
});

describe("/team/claims/[id]: bank details on file and confirmed (RB.5)", () => {
  it("keeps Submit blocked, and says why, when no bank details are on file", async () => {
    scriptDraft([RED_INVOICE], claimRow(), null);
    await render();
    expect(moves[0].can.submit).toBe(true);
    expect(moves[0].blockers).toEqual(["Add your bank details before submitting."]);
    expect(bank[0].details).toBeNull();
  });

  it("hands the panel the confirmation the claim recorded, so it survives a reload", async () => {
    scriptDraft([RED_INVOICE], claimRow({ metadata: { bankConfirmedAt: "2026-10-06T03:00:00Z" } }));
    await render();
    expect(bank[0]).toMatchObject({ confirmedAt: "2026-10-06T03:00:00Z", confirmable: true });
  });

  it("offers no confirmation once the claim is no longer the owner's to change", async () => {
    scriptDraft([RED_INVOICE], claimRow({ status: "checked", submitted_at: "2026-10-05T04:00:00Z" }));
    await render();
    expect(bank[0]).toMatchObject({ confirmedAt: null, confirmable: false });
  });
});

describe("/team/claims/[id]: whose claim and whose bank details (RB.5.3)", () => {
  it("reads the claim for its owner only, and pre-fills the signed-in person's own bank details", async () => {
    scriptDraft([RED_INVOICE]);
    await render();
    // The owner scope is in the query, so a claim of anyone else is never read.
    expect(filtersOn("reimbursement_claims")).toEqual([[["eq", "id", CLAIM], ["eq", "person_id", OWNER]]]);
    expect(filtersOn("people_sensitive")).toEqual([[["eq", "person_id", OWNER]]]);
    expect(bank).toEqual([{ details: { bankName: "Techcombank", accountNumber: ACCOUNT, branch: "" }, claimId: CLAIM, confirmedAt: null, confirmable: true }]);
  });

  it("reads the signed-in person's bank details, never those of the person the claim names", async () => {
    // The fake records the owner filter but does not apply it, so this row
    // stands for whatever claim the read hands the page: the details the page
    // asks for must still be the viewer's own.
    scriptDraft([RED_INVOICE], claimRow({ person_id: "person-someone-else" }));
    await render();
    expect(filtersOn("people_sensitive")).toEqual([[["eq", "person_id", OWNER]]]);
  });

  it("is a 404 for a claim that is not the viewer's, and reads no bank details", async () => {
    viewer.personId = "person-someone-else";
    script("reimbursement_claims", { data: [] });
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(filtersOn("reimbursement_claims")).toEqual([[["eq", "id", CLAIM], ["eq", "person_id", "person-someone-else"]]]);
    expect(calls.some((c) => c.table === "people_sensitive")).toBe(false);
    expect(bank).toHaveLength(0);
  });

  it("is a 404 for a malformed id, without reading anything", async () => {
    await expect(render("not-a-claim")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(calls).toHaveLength(0);
  });
});

describe("/team/claims/[id]: the trip and the clients to rebill (RB.11)", () => {
  it("hands a draft's owner the trip picker, with the claim's trip, and the clients to rebill", async () => {
    // The claim's own trip is read first, then the picker's list.
    script("events", { data: [AUSTRALIA] });
    scriptDraft([RED_INVOICE], claimRow({ trip_event_id: "ev-1" }));
    await render();
    expect(tripIslands).toHaveLength(1);
    expect(tripIslands[0].current).toMatchObject({ id: "ev-1", title: "Australia trip" });
    expect(tripIslands[0].trips.map((t) => t.id)).toEqual(["ev-1"]);
    expect(items[0]).toMatchObject({ removal: "delete", companies: [{ id: "co-acme", name: "Acme Pty Ltd" }] });
    // The picker lists only the event types that are trips.
    expect(filtersOn("events")[1]).toContainEqual(["in", "type", ["retreat", "private_trip", "company_event"]]);
  });

  it("shows a locked claim's trip by name, with no picker, and reads no list", async () => {
    script("events", { data: [AUSTRALIA] });
    scriptDraft([RED_INVOICE], claimRow({ status: "checked", submitted_at: "2026-10-05T04:00:00Z", trip_event_id: "ev-1" }));
    const html = await render();
    expect(tripIslands).toHaveLength(0);
    expect(html).toContain("Australia trip · Oct 2, 2026 – Oct 9, 2026");
    expect(calls.filter((c) => c.table === "events")).toHaveLength(1);
    expect(calls.some((c) => c.table === "companies")).toBe(false);
  });
});

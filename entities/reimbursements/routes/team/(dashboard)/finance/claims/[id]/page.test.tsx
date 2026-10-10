import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { answerOnlySelectedColumns, calls, fakeSupabase, resetFake, script, scriptStorage } from "@/kernel/data/testing/fake-company-os";
import { formatVndWhole } from "@/kernel/ui/format";

// RB.3.3, the checker's page for one claim: each receipt beside its line, and
// the total the checker confirms it goes to the approver at. Rendered through
// the real read (readClaimForChecker) on the kernel's fake. A photo is shown
// inline; every other document — a PDF, which every red invoice is (RB.2) —
// is reached only through OpenDocument, so the test pins which file on which
// claim each Open button asks for (openClaimFile and the signer it calls are
// tested in lib/decision-actions.test.ts and claim-files.test.ts). The two client islands
// are stubbed to record what the page hands them.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const asked: string[] = [];
let viewer: string | null = "person-finance";
let decidesOwn = false;
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async (p: string) => (
    asked.push(p),
    { personId: viewer, user: { email: "finance@example.test" }, may: (q: string) => q === "reimbursements.decide-own" && decidesOwn }
  ),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push() {}, refresh() {} }),
}));
vi.mock("@/entities/reimbursements/lib/decision-actions", () => ({
  declineItem: async () => ({ ok: true }),
  decideClaim: async () => ({ ok: true }),
  enterItemRate: async () => ({ ok: true }),
  openClaimFile: async () => ({ ok: true, url: "" }),
  rereadReceipt: async () => ({ ok: true }),
}));
type Opened = { claimId: string; fileId: string; label: string };
const opened = vi.hoisted(() => [] as Opened[]);
vi.mock("@/entities/reimbursements/ui/OpenDocument", async () => {
  const { createElement } = await import("react");
  return {
    OpenDocument: (p: Opened) => (opened.push({ claimId: p.claimId, fileId: p.fileId, label: p.label }), createElement("button", { "data-file": p.fileId }, `Open ${p.label}`)),
  };
});
type Moves = { claimId: string; move: string; total: string };
const moves = vi.hoisted(() => [] as Moves[]);
vi.mock("@/entities/reimbursements/ui/ReviewDecision", () => ({
  ReviewDecision: (p: { claimId: string; kind: string; totalLabel: string }) => (moves.push({ claimId: p.claimId, move: p.kind, total: p.totalLabel }), null),
}));
type Rated = { claimId: string; itemId: string; currency: string; pending: boolean };
const rated = vi.hoisted(() => [] as Rated[]);
vi.mock("@/entities/reimbursements/ui/EnterRate", async () => {
  const { createElement } = await import("react");
  return {
    EnterRate: (p: Rated) => (
      rated.push({ claimId: p.claimId, itemId: p.itemId, currency: p.currency, pending: p.pending }), createElement("span", { "data-rate": p.itemId }, "Enter the rate")
    ),
  };
});

import CheckClaimPage from "./page";

const CLAIM = "11111111-1111-4111-8111-111111111111";
const PHOTO = `claim/${CLAIM}/item-1/file-1-grab.jpg`;
const RED_INVOICE = `claim/${CLAIM}/item-3/file-3-HD-0831.pdf`;
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

/** A submitted claim: a photo receipt, a declined dinner, and a red invoice PDF, in the order the page reads them. */
function scriptClaim(status = "submitted", events: Record<string, unknown>[] = []) {
  script(
    "reimbursement_claims",
    {
      data: [
        {
          id: CLAIM,
          title: "Hanoi workshop",
          status,
          person_id: "person-a",
          submitted_at: "2026-10-01T03:00:00Z",
          approved_total_vnd: null,
          approved_at: null,
          paid_at: null,
          created_at: "2026-09-30T03:00:00Z",
          metadata: {},
          owner: { display_name: "Avery Stone" },
        },
      ],
    },
  );
  script("reimbursement_claim_items", {
    data: [item("item-1", 126000), item("item-2", 900000, { declined_at: "2026-10-02T03:00:00Z", decline_reason: "Personal dinner" }), item("item-3", 500000, invoiceReading)],
  });
  script("reimbursement_claim_events", { data: events });
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
      { path: PHOTO, signedUrl: "https://store.test/photo", error: null },
      { path: RED_INVOICE, signedUrl: "https://store.test/red-invoice", error: null },
    ],
  });
  script("legal_entities", { data: [{ slug: "acme-vn", name: "Acme", legal_name: "CÔNG TY TNHH ACME VIỆT NAM", tax_id: null }] });
}

// RB.9: the AI read the red invoice and found it made out to someone else.
let invoiceReading: Record<string, unknown> = {};
// A fictional code, in a constant: the fork scanner refuses a tax-code key beside a quoted value.
const OTHER_CODE = "0311111111";
const READING = {
  amount_minor: 500000,
  currency: "VND",
  bought_on: "2026-09-29",
  seller: "Highlands Coffee",
  category: "meals_travel",
  is_red_invoice: true,
  buyer_name: "Nguyen Van A",
  buyer_tax_code: OTHER_CODE,
  confidence: "high",
  notes: null,
  file_id: "file-3",
  read_at: "2026-10-01T03:00:00Z",
};

const render = async (id = CLAIM) => renderToStaticMarkup(await CheckClaimPage({ params: Promise.resolve({ id }) }));
/** The receipt rows in order (RB.14), each with what opens under it: its documents, the AI reading, its controls. */
const lines = (html: string) => html.split(/class="admin-rb-row(?: is-open)?"/).slice(1);

beforeEach(() => {
  resetFake();
  answerOnlySelectedColumns();
  asked.length = 0;
  opened.length = 0;
  moves.length = 0;
  rated.length = 0;
  viewer = "person-finance";
  decidesOwn = false;
  invoiceReading = {};
});

describe("/team/finance/claims/[id], the AI reading (RB.9)", () => {
  // RB.21 (Mai): the reader's own free-text note is not drawn. The checker reads
  // the document; the fields, the comparison and the warnings stay.
  it("does not draw the AI's free-text note", async () => {
    invoiceReading = { ai_reading: { ...READING, notes: "This is a bank transaction statement, not a formal receipt." }, ai_flags: [], duplicate_of_item_id: null };
    scriptClaim();
    const html = await render();
    expect(html).not.toContain("The AI noted");
    expect(html).not.toContain("not a formal receipt");
    expect(html).toContain("AI read");
  });

  it("shows what the AI read beside the red invoice it read, with its warnings and a re-read", async () => {
    invoiceReading = { ai_reading: READING, ai_flags: ["buyer_not_organisation"], duplicate_of_item_id: null };
    scriptClaim();
    const [photo, , invoice] = lines(await render());
    expect(invoice).toContain("AI read");
    expect(invoice).toContain("Highlands Coffee");
    expect(invoice).toContain("Nguyen Van A");
    expect(invoice).toContain("The red invoice is not made out to the organisation.");
    // Production has no tax code yet: the checker is told only the name was compared.
    expect(invoice).toContain("only the buyer&#x27;s name was compared");
    expect(invoice).toContain("Read again");
    // A line nobody has read yet carries no chip (RB.17, Mai), and can still be read.
    expect(photo).not.toContain("Not read by AI");
    expect(photo).toContain("Read again");
  });

  it("names the receipt on the same claim that one may duplicate", async () => {
    invoiceReading = { ai_reading: READING, ai_flags: ["possible_duplicate"], duplicate_of_item_id: "item-1" };
    scriptClaim();
    const [, , invoice] = lines(await render());
    expect(invoice).toContain("This may be a receipt that is already claimed.");
    expect(invoice).toContain("It looks like Seller item-1 on this claim.");
  });
});

describe("/team/finance/claims/[id]", () => {
  it("shows each receipt's document beside its own line: the photo inline, the red invoice PDF behind an Open button for that file on this claim", async () => {
    scriptClaim();
    const html = await render();
    expect(asked).toEqual(["reimbursements.check"]);
    const rows = lines(html);
    expect(rows).toHaveLength(3);
    const [photo, dinner, invoice] = rows;
    expect(photo).toContain("Seller item-1");
    expect(photo).toContain('src="https://store.test/photo"');
    expect(photo).toContain('data-file="file-1"');
    expect(dinner).toContain("Declined: Personal dinner");
    expect(dinner).toContain("Restore");
    expect(dinner).not.toContain("data-file=");
    expect(invoice).toContain("Seller item-3");
    expect(invoice).toContain('data-file="file-3"');
    expect(invoice).toContain("Open red invoice");
    // A PDF is never put in an <img>: the Open button is the only way to it.
    expect(html).not.toContain("https://store.test/red-invoice");
    expect(opened).toEqual([
      { claimId: CLAIM, fileId: "file-1", label: "receipt" },
      { claimId: CLAIM, fileId: "file-3", label: "red invoice" },
    ]);
    // RB.5.3: a checker is not one of the people who may see the claimant's
    // bank details, so this page never asks for them, not even in a read whose
    // failure it would swallow.
    expect(calls.some((c) => c.table === "people_sensitive")).toBe(false);
  });

  it("confirms the total without the declined receipt, in the header and in the check's confirmation", async () => {
    scriptClaim();
    const html = await render();
    const kept = formatVndWhole(626000);
    expect(html).toContain(kept);
    // 1,526,000 is every receipt, the declined dinner included: never the figure confirmed.
    expect(html).not.toContain(formatVndWhole(1526000));
    expect(moves).toEqual([{ claimId: CLAIM, move: "check", total: kept }]);
  });

  it("shows the checker's own claim with no moves", async () => {
    viewer = "person-a";
    scriptClaim();
    const html = await render();
    expect(html).toContain("This is your own claim.");
    expect(moves).toHaveLength(0);
    expect(html).not.toContain("Restore");
  });

  it("gives the employer the check on their own claim (decide-own)", async () => {
    viewer = "person-a";
    decidesOwn = true;
    scriptClaim();
    const html = await render();
    expect(html).not.toContain("This is your own claim.");
    expect(moves.map((m) => m.move)).toEqual(["check"]);
    expect(html).toContain("Restore");
  });

  it("names every move in the history the way every claim view does", async () => {
    const at = "2026-10-03T03:00:00Z";
    const ev = (id: string, from: string | null, to: string) => ({ id, from_status: from, to_status: to, reason: null, created_at: at, actor: null });
    scriptClaim("approved", [ev("e1", null, "draft"), ev("e2", "draft", "submitted"), ev("e3", "approved", "in_run"), ev("e4", "in_run", "approved")]);
    const html = await render();
    // Only the milestones are drawn (RB.19): the payment run's comings and goings are not.
    expect(html).toContain("Submitted");
    for (const words of ["Started", "Added to a payment run", "Payment returned; waiting for the next run"]) expect(html).not.toContain(words);
    // Not waiting to be checked: shown as it stands, with no moves.
    expect(moves).toHaveLength(0);
    expect(html).not.toContain("Restore");
  });

  it("refuses a checker with no person record, reading nothing, as the queues and the actions do", async () => {
    viewer = null;
    const html = await render();
    expect(html).toContain("Your sign-in has no person record, so you cannot work on claims here.");
    expect(calls).toHaveLength(0);
    expect(moves).toHaveLength(0);
  });

  it("shows a receipt abroad in its own currency, its rate pending, the lost-receipt note highlighted, and a rate to enter by hand", async () => {
    script("reimbursement_claims", {
      data: [
        {
          id: CLAIM,
          title: "Melbourne",
          status: "submitted",
          person_id: "person-a",
          submitted_at: "2026-10-05T03:00:00Z",
          approved_total_vnd: null,
          approved_at: null,
          paid_at: null,
          created_at: "2026-10-04T03:00:00Z",
          metadata: {},
          owner: { display_name: "Avery Stone" },
        },
      ],
    });
    const abroad = { currency: "aud", bought_in_vietnam: false, bought_on: "2026-10-04" };
    script("reimbursement_claim_items", {
      data: [
        item("item-1", 0, { ...abroad, amount_cents: 6280, amount_vnd: null, fx_source: "none", lost_receipt_note: "Left it in the taxi." }),
        item("item-2", 1157153, { ...abroad, amount_cents: 6280, fx_rate: 18426, fx_source: "techcombank", fx_as_of: "2026-10-03" }),
        item("item-3", 1170000, { ...abroad, amount_cents: 6280, fx_rate: 18630.573248, fx_source: "card", charged_vnd: 1170000 }),
      ],
    });
    script("reimbursement_claim_events", { data: [] });
    script("reimbursement_files", { data: [] });
    script("legal_entities", { data: [{ slug: "acme-vn", name: "Acme", legal_name: "CÔNG TY TNHH ACME VIỆT NAM", tax_id: null }] });
    const html = await render();
    const [pending, valued, card] = lines(html);
    expect(pending).toContain("Rate pending");
    expect(pending).toContain("A$62.80, rate pending");
    expect(pending).toContain("Lost abroad. The owner explains:");
    expect(pending).toContain("Left it in the taxi.");
    expect(valued).toContain(formatVndWhole(1157153));
    expect(valued).toContain("A$62.80 at Techcombank&#x27;s selling rate of 18,426 on Oct 3, 2026");
    expect(card).toContain("A$62.80, as the card charged it");
    // A rate can be entered for a receipt a rate values, never for one valued at its card charge.
    expect(rated).toEqual([
      { claimId: CLAIM, itemId: "item-1", currency: "aud", pending: true },
      { claimId: CLAIM, itemId: "item-2", currency: "aud", pending: false },
    ]);
    expect(html).toContain("One receipt&#x27;s rate is pending");
  });

  it("is a 404 for a malformed id, without reading, and for a claim that is not there", async () => {
    await expect(render("not-a-claim")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(calls).toHaveLength(0);
    script("reimbursement_claims", { data: [] });
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { answerOnlySelectedColumns, calls, fakeSupabase, resetFake, script, scriptStorage } from "@/kernel/data/testing/fake-company-os";
import { formatVndWhole } from "@/kernel/ui/format";

// RB.4, Admin's page for one claim: every Admin viewer sees it, amounts
// included and bank details never; the checker's moves appear for a viewer
// who checks while it waits to be checked, the approver's for one who
// approves while it waits for approval, and each sends the decider back to
// their queue in Admin. Rendered through the real read on the kernel's fake;
// the client islands are stubbed to record what the page hands them.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const asked: string[] = [];
let viewer: string | null = "person-employer";
let holds = new Set<string>();
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async (p: string) => (asked.push(p), { personId: viewer, user: { email: "employer@example.test" }, may: (q: string) => holds.has(q) }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push() {}, refresh() {} }),
}));
const actions = vi.hoisted(() => ({
  decideClaim: async () => ({ ok: true }),
  declineItem: async () => ({ ok: true }),
  enterItemRate: async () => ({ ok: true }),
  rereadReceipt: async () => ({ ok: true }),
  approverDecides: async () => ({ ok: true }),
  openClaimFileInAdmin: async () => ({ ok: true, url: "" }),
}));
vi.mock("@/entities/reimbursements/lib/decision-actions", () => ({
  decideClaim: actions.decideClaim,
  declineItem: actions.declineItem,
  enterItemRate: actions.enterItemRate,
  rereadReceipt: actions.rereadReceipt,
  approverDecides: actions.approverDecides,
  openClaimFileInAdmin: actions.openClaimFileInAdmin,
}));
type Rated = { itemId: string; pending: boolean; enter: unknown };
const rated = vi.hoisted(() => [] as Rated[]);
vi.mock("@/entities/reimbursements/ui/EnterRate", () => ({
  EnterRate: (p: Rated) => (rated.push({ itemId: p.itemId, pending: p.pending, enter: p.enter }), null),
}));
const opened = vi.hoisted(() => [] as unknown[]);
vi.mock("@/entities/reimbursements/ui/OpenDocument", async () => {
  const { createElement } = await import("react");
  return { OpenDocument: (p: { fileId: string; label: string; openFile: unknown }) => (opened.push(p.openFile), createElement("button", { "data-file": p.fileId }, `Open ${p.label}`)) };
});
// The decision panel (RB.14), recording what the page hands it.
type Moves = { move: string; decide: unknown; total: string; hint: string; requireSeen: boolean };
const moves = vi.hoisted(() => [] as Moves[]);
vi.mock("@/entities/reimbursements/ui/ReviewDecision", () => ({
  ReviewDecision: (p: { kind: string; decide: unknown; totalLabel: string; passHint: string; seen: unknown }) => (
    moves.push({ move: p.kind, decide: p.decide, total: p.totalLabel, hint: p.passHint, requireSeen: p.seen !== null }), null
  ),
}));

import AdminClaimPage from "./page";

const CLAIM = "11111111-1111-4111-8111-111111111111";
const RED_INVOICE = `claim/${CLAIM}/item-2/file-2-HD.pdf`;
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

function scriptClaim(status: string, person_id = "person-a", approved_total_vnd: number | null = null) {
  script("reimbursement_claims", {
    data: [
      {
        id: CLAIM,
        title: "Hanoi workshop",
        status,
        person_id,
        submitted_at: "2026-10-01T03:00:00Z",
        approved_total_vnd,
        approved_at: approved_total_vnd === null ? null : "2026-10-05T03:00:00Z",
        paid_at: null,
        created_at: "2026-09-30T03:00:00Z",
        metadata: {},
        owner: { display_name: "Avery Stone" },
      },
    ],
  });
  script("reimbursement_claim_items", { data: [item("item-1", 126000, { declined_at: "2026-10-02T03:00:00Z", decline_reason: "Personal" }), item("item-2", 500000)] });
  script("reimbursement_claim_events", { data: [] });
  script(
    "reimbursement_files",
    { data: [{ id: "file-2", claim_item_id: "item-2", kind: "red_invoice", filename: "HD.pdf", mime_type: "application/pdf", size_bytes: 2000 }] },
    { data: [{ id: "file-2", storage_path: RED_INVOICE, mime_type: "application/pdf" }] },
  );
  scriptStorage("createSignedUrls", { data: [{ path: RED_INVOICE, signedUrl: "https://store.test/red", error: null }] });
  // What the AI reading beside each red invoice compared its buyer with (RB.9).
  script("legal_entities", { data: [{ slug: "acme-vn", name: "Acme", legal_name: "CÔNG TY TNHH ACME VIỆT NAM", tax_id: null }] });
}

const render = async (id = CLAIM) => renderToStaticMarkup(await AdminClaimPage({ params: Promise.resolve({ id }) }));
/** The decider's queue, read for where a decision leads (RB.14): empty, so it leads back to the queue. */
const scriptEmptyQueue = () => script("reimbursement_claims", { data: [] });
/** The queue the next-claim lookup read, by the status it asked for. */
const queueRead = () => calls.filter((c) => c.table === "reimbursement_claims").at(-1)?.filters;

beforeEach(() => {
  resetFake();
  answerOnlySelectedColumns();
  asked.length = 0;
  opened.length = 0;
  moves.length = 0;
  rated.length = 0;
  viewer = "person-employer";
  holds = new Set();
});

describe("/admin/finance/reimbursements/[id]", () => {
  it("shows an Admin viewer the claim and its amounts, no moves and no bank details, documents opened behind Admin's view", async () => {
    scriptClaim("checked");
    const html = await render();
    expect(asked).toEqual(["reimbursements.view"]);
    expect(html).toContain("Hanoi workshop");
    expect(html).toContain(formatVndWhole(500000));
    expect(html).toContain("Declined: Personal");
    expect(moves).toHaveLength(0);
    expect(html).not.toContain("Restore");
    // The AI reading is shown to every viewer; only a checker may have it read again (RB.9).
    // No chip on an unread receipt (RB.17); its panel still says so.
    expect(html).not.toContain("Not read by AI");
    expect(html).toContain("The AI has not read this receipt.");
    expect(html).not.toContain("Read again");
    expect(opened).toEqual([actions.openClaimFileInAdmin]);
    expect(calls.some((c) => c.table === "people_sensitive")).toBe(false);
    expect(html).toContain('href="/admin/finance/reimbursements/all"');
  });

  it("gives an approver the approval of a checked claim, at the kept total, returning to To approve in Admin", async () => {
    holds.add("reimbursements.approve");
    scriptClaim("checked");
    scriptEmptyQueue();
    const html = await render();
    // At the kept total: the declined receipt is left out. The approver is not asked to tick receipts.
    expect(moves).toEqual([{ move: "approve", decide: actions.approverDecides, total: formatVndWhole(500000), hint: expect.stringContaining("Fixed at this total"), requireSeen: false }]);
    expect(queueRead()).toEqual(expect.arrayContaining([["eq", "status", "checked"]]));
    expect(html).toContain('href="/admin/finance/reimbursements/to-approve"');
    expect(html).not.toContain("/team/");
    // An approver who does not check reads three steps, not the checker's (RB.22, Dave).
    expect(html).toContain("admin-rb-stages--three");
    expect(html).not.toMatch(/admin-rb-stage-label">Checked</);
  });

  it("gives a checker the check of a submitted claim, with declines, returning to To check in Admin", async () => {
    holds.add("reimbursements.check").add("reimbursements.approve");
    scriptClaim("submitted");
    scriptEmptyQueue();
    const html = await render();
    // The checker passes the claim on only once every receipt is looked at.
    expect(moves.map((m) => [m.move, m.decide, m.requireSeen])).toEqual([["check", actions.decideClaim, true]]);
    expect(queueRead()).toEqual(expect.arrayContaining([["eq", "status", "submitted"]]));
    expect(html).toContain("Restore");
    expect(html).toContain("Read again");
    expect(html).not.toContain("/team/");
    // The checker keeps the Checked step: it is their job.
    expect(html).toMatch(/admin-rb-stage-label">Checked</);
    expect(html).not.toContain("admin-rb-stages--three");
  });

  it("gives a checker in Admin the rate by hand for a receipt abroad, and marks the total while its rate is pending (RB.10)", async () => {
    holds.add("reimbursements.check");
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
    const abroad = { currency: "aud", bought_in_vietnam: false, bought_on: "2026-10-04", amount_cents: 6280 };
    script("reimbursement_claim_items", {
      data: [
        item("item-1", 0, { ...abroad, amount_vnd: null, fx_source: "none" }),
        item("item-2", 1157153, { ...abroad, fx_rate: 18426, fx_source: "techcombank", fx_as_of: "2026-10-03" }),
      ],
    });
    script("reimbursement_claim_events", { data: [] });
    script("reimbursement_files", { data: [] });
    script("legal_entities", { data: [{ slug: "acme-vn", name: "Acme", legal_name: "CÔNG TY TNHH ACME VIỆT NAM", tax_id: null }] });
    scriptEmptyQueue();
    const html = await render();
    expect(rated).toEqual([
      { itemId: "item-1", pending: true, enter: actions.enterItemRate },
      { itemId: "item-2", pending: false, enter: actions.enterItemRate },
    ]);
    expect(html).toContain("One receipt&#x27;s rate is pending");
    expect(html).toContain(formatVndWhole(1157153));
    expect(html).toContain("+ 1 receipt, rate pending");
  });

  it("gives the approver nothing on their own claim, unless they hold decide-own", async () => {
    holds.add("reimbursements.approve");
    scriptClaim("checked", "person-employer");
    expect(await render()).toContain("This is your own claim. Someone else decides it.");
    expect(moves).toHaveLength(0);

    holds.add("reimbursements.decide-own");
    scriptClaim("checked", "person-employer");
    scriptEmptyQueue();
    await render();
    expect(moves.map((m) => m.move)).toEqual(["approve"]);
  });

  it("shows an approved claim at its frozen total, with nothing to decide", async () => {
    holds.add("reimbursements.approve");
    scriptClaim("approved", "person-a", 480000);
    const html = await render();
    expect(html).toContain(formatVndWhole(480000));
    expect(moves).toHaveLength(0);
  });

  it("lets a viewer with no person record read, never decide", async () => {
    viewer = null;
    holds.add("reimbursements.approve");
    scriptClaim("checked");
    expect(await render()).toContain("Hanoi workshop");
    expect(moves).toHaveLength(0);
  });

  it("is a 404 for a malformed id, without reading", async () => {
    await expect(render("nope")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(calls).toHaveLength(0);
  });
});

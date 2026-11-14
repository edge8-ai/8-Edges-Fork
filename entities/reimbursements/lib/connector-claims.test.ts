// The owner's claim steps the Team Portal connector takes (MCP.3): a receipt
// goes into the person's open draft (or a new one for the month), is uploaded
// to the slot its own claim step signed, confirmed and read; a claim is sent
// only if it is the person's own. Each lower step is the claims page's own and
// has its own tests; this pins the order and the owner they are handed.
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  createClaim: vi.fn(),
  transitionClaim: vi.fn(),
  claimWriterFor: vi.fn(() => "writer"),
  startDroppedReceipt: vi.fn(),
  confirmReceiptUpload: vi.fn(),
  readReceipt: vi.fn(),
  listMyClaims: vi.fn(),
  readClaimRow: vi.fn(),
  removeClaimItem: vi.fn(),
  uploadToSignedUrl: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/kernel/data/supabase", () => ({ supabase: { storage: { from: (b: string) => (m.from(b), { uploadToSignedUrl: m.uploadToSignedUrl }) } } }));
vi.mock("@/kernel/config/dates", () => ({ saigonToday: () => "2026-11-14" }));
vi.mock("./claim-lifecycle", () => ({ createClaim: m.createClaim, transitionClaim: m.transitionClaim, claimWriterFor: m.claimWriterFor }));
vi.mock("./claim-items", () => ({ startDroppedReceipt: m.startDroppedReceipt }));
vi.mock("./claim-files", () => ({ confirmReceiptUpload: m.confirmReceiptUpload }));
vi.mock("./receipt-reading", () => ({ readReceipt: m.readReceipt }));
vi.mock("./my-claims", () => ({ listMyClaims: m.listMyClaims }));
vi.mock("./own-claims", () => ({ readClaimRow: m.readClaimRow }));
vi.mock("./item-removal", () => ({ removeClaimItem: m.removeClaimItem }));

const { addReceiptToOwnQueue, submitOwnClaim, CONNECTOR_RECEIPT_MAX_BYTES } = await import("./connector-claims");

const ANA = { personId: "person-ana", teamMemberId: "tm-ana", displayName: "Ana" } as never;
const FILE = { filename: "grab.jpg", mimeType: "image/jpeg", bytes: new Uint8Array([1, 2, 3]) };
const SLOT = { ok: true, itemId: "item-1", fileId: "file-1", bucket: "reimbursement-receipts", path: "person-ana/claim-1/file-1", token: "tok" };

beforeEach(() => {
  vi.clearAllMocks();
  m.listMyClaims.mockResolvedValue([]);
  m.createClaim.mockResolvedValue({ ok: true, id: "claim-new" });
  m.startDroppedReceipt.mockResolvedValue(SLOT);
  m.uploadToSignedUrl.mockResolvedValue({ error: null });
  m.confirmReceiptUpload.mockResolvedValue({ ok: true, kind: "receipt" });
  m.readReceipt.mockResolvedValue({ ok: true, reading: { seller: "Grab", amount_minor: 184000 }, flags: [] });
});

describe("addReceiptToOwnQueue", () => {
  it("starts a draft for the month when none is open, for the person's own claims", async () => {
    const out = await addReceiptToOwnQueue(ANA, FILE);
    expect(m.listMyClaims).toHaveBeenCalledWith("person-ana");
    expect(m.createClaim).toHaveBeenCalledWith(expect.objectContaining({ title: "November 2026 expenses", owner: { personId: "person-ana", teamMemberId: "tm-ana" } }));
    expect(out).toEqual({ ok: true, value: { claimId: "claim-new", claimTitle: "November 2026 expenses", newClaim: true, reading: { seller: "Grab", amount_minor: 184000 }, readingNote: null } });
  });

  it("adds to the open draft rather than starting another", async () => {
    m.listMyClaims.mockResolvedValue([{ id: "claim-sent", status: "submitted", title: "October" }, { id: "claim-draft", status: "draft", title: "November" }]);
    const out = await addReceiptToOwnQueue(ANA, FILE);
    expect(m.createClaim).not.toHaveBeenCalled();
    expect(m.startDroppedReceipt).toHaveBeenCalledWith(expect.objectContaining({ claimId: "claim-draft", personId: "person-ana" }));
    expect(out.ok && out.value.newClaim).toBe(false);
  });

  it("uploads to the slot the claim step signed, then confirms and reads that file as the owner", async () => {
    await addReceiptToOwnQueue(ANA, FILE);
    expect(m.startDroppedReceipt).toHaveBeenCalledWith({ claimId: "claim-new", personId: "person-ana", declared: { name: "grab.jpg", size: 3, type: "image/jpeg" } });
    expect(m.from).toHaveBeenCalledWith("reimbursement-receipts");
    expect(m.uploadToSignedUrl).toHaveBeenCalledWith(SLOT.path, "tok", FILE.bytes, { contentType: "image/jpeg" });
    expect(m.confirmReceiptUpload).toHaveBeenCalledWith({ fileId: "file-1", personId: "person-ana" });
    expect(m.readReceipt).toHaveBeenCalledWith("file-1", { onlyIfUnread: true, fileDeductions: true });
  });

  it("checks a named claim is the person's own before adding to it", async () => {
    m.readClaimRow.mockResolvedValue({ ok: false, error: "Claim not found." });
    expect(await addReceiptToOwnQueue(ANA, FILE, "claim-of-bao")).toEqual({ ok: false, error: "Claim not found." });
    expect(m.readClaimRow).toHaveBeenCalledWith("claim-of-bao", { ownedBy: "person-ana" });
    expect(m.startDroppedReceipt).not.toHaveBeenCalled();
  });

  it("refuses an empty or oversized file before touching anything", async () => {
    expect(await addReceiptToOwnQueue(ANA, { ...FILE, bytes: new Uint8Array() })).toMatchObject({ ok: false });
    expect(await addReceiptToOwnQueue(ANA, { ...FILE, bytes: new Uint8Array(CONNECTOR_RECEIPT_MAX_BYTES + 1) })).toEqual({ ok: false, error: "Keep the receipt under 3 MB." });
    expect(m.listMyClaims).not.toHaveBeenCalled();
  });

  it("says a failed upload is a failure, confirms nothing, and takes the blank receipt off the draft", async () => {
    m.removeClaimItem.mockResolvedValue({ ok: true });
    m.uploadToSignedUrl.mockResolvedValue({ error: { message: "storage down" } });
    expect(await addReceiptToOwnQueue(ANA, FILE)).toEqual({ ok: false, error: "Could not store the receipt: storage down" });
    expect(m.confirmReceiptUpload).not.toHaveBeenCalled();
    expect(m.removeClaimItem).toHaveBeenCalledWith({ itemId: "item-1", personId: "person-ana" });
  });

  it("takes the blank receipt off when the upload cannot be confirmed", async () => {
    m.removeClaimItem.mockResolvedValue({ ok: true });
    m.confirmReceiptUpload.mockResolvedValue({ ok: false, error: "That file is not the type it said." });
    expect(await addReceiptToOwnQueue(ANA, FILE)).toEqual({ ok: false, error: "That file is not the type it said." });
    expect(m.removeClaimItem).toHaveBeenCalledWith({ itemId: "item-1", personId: "person-ana" });
    expect(m.readReceipt).not.toHaveBeenCalled();
  });

  it("keeps the receipt when the AI cannot read it, and says what to do", async () => {
    m.readReceipt.mockResolvedValue({ ok: false, error: "model timeout" });
    const out = await addReceiptToOwnQueue(ANA, FILE);
    expect(out.ok && out.value.reading).toBeNull();
    expect(out.ok && out.value.readingNote).toMatch(/could not be read/);
  });
});

describe("submitOwnClaim", () => {
  it("submits only a claim read as the person's own, with a writer scoped to them", async () => {
    const row = { id: "claim-1", status: "draft", personId: "person-ana", title: "Nov", submittedAt: null };
    m.readClaimRow.mockResolvedValue({ ok: true, value: row });
    m.transitionClaim.mockResolvedValue({ ok: true });
    expect(await submitOwnClaim(ANA, "claim-1")).toEqual({ ok: true });
    expect(m.readClaimRow).toHaveBeenCalledWith("claim-1", { ownedBy: "person-ana" });
    expect(m.claimWriterFor).toHaveBeenCalledWith("claim-1", { ownedBy: "person-ana" });
    expect(m.transitionClaim).toHaveBeenCalledWith(expect.objectContaining({ row, move: "submit", actor: expect.objectContaining({ kind: "owner", personId: "person-ana", mayDecideOwn: false }) }));
  });

  it("does nothing with someone else's claim", async () => {
    m.readClaimRow.mockResolvedValue({ ok: false, error: "Claim not found." });
    expect(await submitOwnClaim(ANA, "claim-of-bao")).toEqual({ ok: false, error: "Claim not found." });
    expect(m.transitionClaim).not.toHaveBeenCalled();
  });
});

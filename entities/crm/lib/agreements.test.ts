import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// E-signature. The rules the plan fixed, proven against the two approval rows
// an agreement is made of: only the named signer's own portal account signs,
// never an admin viewing the portal as the client; Edge8 signs before it can
// be sent; the text signed is the text prepared; and a signature is taken once.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => {}) }));
vi.mock("@/kernel/messaging/email", () => ({ sendTransactionalEmail: vi.fn(async () => true) }));
vi.mock("@/kernel/messaging/lark", () => ({ notifyOps: vi.fn(async () => true) }));
// AC.15: Edge8's signer is mailed a link to the deal only if they may open it.
const cannotOpen = vi.hoisted(() => new Set<string>());
vi.mock("@/kernel/identity/may-open", () => ({
  recipientMayOpenByEmail: vi.fn(async (email: string) => (href: string) => Boolean(href) && !cannotOpen.has(email)),
}));
vi.mock("@/kernel/identity/person-by-email", () => ({
  personIdForEmail: vi.fn(async () => "person-signer"),
  personIdForEmailOrNull: vi.fn(async () => "person-admin"),
}));
const TEXT = "# Master Services Agreement\n\nThe client pays the fee.\n";
const stored = { bytes: new TextEncoder().encode(TEXT) };
vi.mock("@/entities/client-programs", () => ({
  downloadDocumentBytes: vi.fn(async () => ({ ok: true, bytes: stored.bytes })),
  uploadAgreementBytes: vi.fn(async () => ({ ok: true, path: "company/co-1/agreements/x.md" })),
  recordDocument: vi.fn(async () => ({ ok: true, id: "agr-1" })),
  signedDownloadForPath: vi.fn(async () => ({ ok: true, url: "https://storage.test/download" })),
  signedViewForPath: vi.fn(async () => ({ ok: true, url: "https://storage.test/view" })),
}));

import { deriveStatus, mayClientSee, type Agreement, type AgreementHeader } from "./agreements";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { notifyOps } from "@/kernel/messaging/lark";
import { completeSignedAgreement, needsInvoice, sendAgreement, signAgreementAsClient, signAgreementAsTeamMember } from "./agreement-signing";
import { readAgreementFile } from "./agreement-prepare";
import { renderAgreementHtml } from "./agreement-render";

const SHA = createHash("sha256").update(TEXT).digest("hex");
const edge8Evidence = { name: "Dave", title: "Founder", email: "dave@edge8.test", signedAt: "2026-10-06T00:00:00Z", ip: null, userAgent: null };
const header: AgreementHeader = {
  type: "client",
  dealId: "deal-1",
  companyId: "co-1",
  companyName: "Example Rentals",
  teamMemberId: null,
  vendorId: null,
  title: "Master Services Agreement",
  filename: "msa.md",
  storagePath: "company/co-1/agreements/x.md",
  contentType: "text/markdown",
  sha256: SHA,
  signer: { name: "Sam Signer", title: "Director", email: "Sam@Example.test", personId: "person-signer" },
  fee: { cents: 1_500_000, currency: "aud", description: "Foundation" },
  preparedBy: "dave@edge8.test",
  edge8: edge8Evidence,
};
// The agreement's own row (company_os.agreements), as the reader selects it.
const agreementRow = (over: Record<string, unknown> = {}) => ({
  id: "agr-1",
  type: "client",
  title: "Master Services Agreement",
  filename: "msa.md",
  storage_path: "company/co-1/agreements/x.md",
  content_type: "text/markdown",
  sha256: SHA,
  deal_id: "deal-1",
  company_id: "co-1",
  team_member_id: null,
  vendor_id: null,
  signer_title: "Director",
  fee_amount_cents: 1_500_000,
  fee_currency: "aud",
  fee_description: "Foundation",
  created_at: "2026-10-06T00:00:00Z",
  signer: { id: "person-signer", display_name: null, preferred_name: null, full_name: "Sam Signer", email: "Sam@Example.test" },
  preparer: { email: "dave@edge8.test" },
  company: { name: "Example Rentals" },
  ...over,
});
// A contractor's agreement: a team record, no company, no deal, no fee.
const contractorRow = () =>
  agreementRow({
    type: "contractor",
    deal_id: null,
    company_id: null,
    team_member_id: "tm-1",
    signer_title: "English Trainer",
    fee_amount_cents: null,
    fee_currency: null,
    fee_description: null,
    storage_path: "team/tm-1/agreements/x.md",
    signer: { id: "person-hoan", display_name: "Hoan Ngo", preferred_name: null, full_name: "Hoan Ngo", email: "hoan@edge8.test" },
    company: null,
  });
const scriptAgreement = (row = agreementRow()) => script("agreements", { data: [row] });
const edge8Row = (state: string, meta: Record<string, unknown> = { label: "x", edge8: edge8Evidence }) => ({
  subject_type: "agreement_edge8_signature",
  subject_id: "agr-1",
  state,
  metadata: meta,
  created_at: "2026-10-06T00:00:00Z",
});
const clientRow = (state: string, meta: Record<string, unknown> = { label: "x" }) => ({
  subject_type: "agreement_client_signature",
  subject_id: "agr-1",
  state,
  metadata: meta,
  created_at: "2026-10-06T01:00:00Z",
});

const actor = (over: Partial<{ email: string; companyScope: string[]; impersonation: unknown }> = {}) => ({
  authUserId: "auth-1",
  personId: "person-signer",
  email: "sam@example.test",
  companyScope: ["co-1"],
  impersonation: null,
  ...over,
}) as Parameters<typeof signAgreementAsClient>[0]["actor"];

const signInput = (over: Partial<Parameters<typeof signAgreementAsClient>[0]> = {}) => ({
  agreementId: "agr-1",
  actor: actor(),
  typedName: "Sam Signer",
  title: "Director",
  consent: true,
  sha256Shown: SHA,
  evidence: { ip: "203.0.113.9", userAgent: "test" },
  ...over,
});

beforeEach(() => {
  resetFake();
  cannotOpen.clear();
  stored.bytes = new TextEncoder().encode(TEXT);
});

describe("deriveStatus", () => {
  it("reads the two signature rows as one status", () => {
    expect(deriveStatus("pending", null)).toBe("draft");
    expect(deriveStatus("approved", null)).toBe("edge8_signed");
    expect(deriveStatus("approved", "pending")).toBe("sent");
    expect(deriveStatus("approved", "approved")).toBe("signed");
    expect(deriveStatus("approved", "cancelled")).toBe("void");
    expect(deriveStatus("cancelled", null)).toBe("void");
  });
});

describe("signAgreementAsClient: who may sign", () => {
  it("refuses an admin viewing the portal as the client, even with the signer's email", async () => {
    const r = await signAgreementAsClient(signInput({ actor: actor({ impersonation: { adminEmail: "ops@edge8.test", sessionId: "s", expiresAt: "2999-01-01" } }) }));
    expect(r).toEqual({ ok: false, error: expect.stringContaining("admin") });
    // Refused before anything was read: an impersonating admin learns nothing.
    expect(calls).toHaveLength(0);
  });

  it("refuses a portal account whose email is not the named signer's", async () => {
    scriptAgreement();
    script("approvals", { data: [edge8Row("approved"), clientRow("pending")] });
    const r = await signAgreementAsClient(signInput({ actor: actor({ email: "colleague@example.test" }) }));
    expect(r).toEqual({ ok: false, error: expect.stringContaining("addressed to Sam Signer") });
    expect(calls.some((c) => c.ops.includes("update"))).toBe(false);
  });

  it("refuses an agreement for a company outside the actor's scope as not found", async () => {
    scriptAgreement();
    script("approvals", { data: [edge8Row("approved"), clientRow("pending")] });
    const r = await signAgreementAsClient(signInput({ actor: actor({ companyScope: ["co-other"] }) }));
    expect(r).toEqual({ ok: false, error: "Agreement not found." });
  });

  it("matches the signer's email without regard to case, and records the evidence", async () => {
    scriptAgreement();
    script("approvals", { data: [edge8Row("approved"), clientRow("pending")] }, { data: { id: "ap-2", metadata: { label: "x" } } }, { data: [{ id: "ap-2" }] });
    const r = await signAgreementAsClient(signInput({ actor: actor({ email: "SAM@example.TEST" }) }));
    expect(r.ok).toBe(true);
    const update = calls.find((c) => c.ops[0] === "update");
    expect(update?.payloads[0]).toEqual(
      expect.objectContaining({
        state: "approved",
        decided_by: "person-signer",
        metadata: expect.objectContaining({ name: "Sam Signer", title: "Director", ip: "203.0.113.9", sha256Shown: SHA, authUserId: "auth-1" }),
      }),
    );
    expect(update?.filters).toContainEqual(["eq", "state", "pending"]);
  });
});

describe("signAgreementAsClient: the text signed is the text prepared", () => {
  it("refuses when the stored file no longer matches the fingerprint", async () => {
    stored.bytes = new TextEncoder().encode(TEXT + "\nA clause added after Edge8 signed.\n");
    scriptAgreement();
    script("approvals", { data: [edge8Row("approved"), clientRow("pending")] });
    const r = await signAgreementAsClient(signInput());
    expect(r).toEqual({ ok: false, error: expect.stringContaining("no longer matches") });
    expect(calls.some((c) => c.ops.includes("update"))).toBe(false);
  });

  it("refuses when the page showed a different fingerprint", async () => {
    scriptAgreement();
    script("approvals", { data: [edge8Row("approved"), clientRow("pending")] });
    const r = await signAgreementAsClient(signInput({ sha256Shown: "0".repeat(64) }));
    expect(r).toEqual({ ok: false, error: expect.stringContaining("changed while you had it open") });
  });
});

describe("signAgreementAsClient: a signature is taken once", () => {
  it("refuses a second signature on an agreement already signed", async () => {
    scriptAgreement();
    script("approvals", { data: [edge8Row("approved"), clientRow("approved", { name: "Sam", title: "Director", email: "sam@example.test", signedAt: "x", ip: null, userAgent: null, authUserId: "a", personId: "p", sha256Shown: SHA })] });
    const r = await signAgreementAsClient(signInput());
    expect(r).toEqual({ ok: false, error: "This agreement is not waiting for a signature." });
  });

  it("refuses the loser of two signatures racing, rather than writing a second decided row", async () => {
    // Both read the agreement as sent; by the time this one decides, the
    // pending row is gone.
    scriptAgreement();
    script("approvals", { data: [edge8Row("approved"), clientRow("pending")] }, { data: null });
    const r = await signAgreementAsClient(signInput());
    expect(r).toEqual({ ok: false, error: "This agreement has already been signed." });
    expect(calls.some((c) => c.ops[0] === "insert" || c.ops[0] === "update")).toBe(false);
  });
});

describe("sendAgreement: Edge8 signs first", () => {
  it("refuses to send while Edge8's signature is pending, and opens nothing", async () => {
    scriptAgreement();
    script("approvals", { data: [edge8Row("pending", { label: "x" })] });
    const r = await sendAgreement({ agreementId: "agr-1", sentBy: "dave@edge8.test", origin: "https://edge8.test" });
    expect(r).toEqual({ ok: false, error: "Sign the agreement for Edge8 before sending it." });
    expect(calls.some((c) => c.ops[0] === "insert")).toBe(false);
  });

  it("opens the client's signature for the named signer once Edge8 has signed", async () => {
    scriptAgreement();
    script("approvals", { data: [edge8Row("approved")] }, { data: null }, { error: null });
    const r = await sendAgreement({ agreementId: "agr-1", sentBy: "dave@edge8.test", origin: "https://edge8.test" });
    expect(r).toEqual({ ok: true, emailed: true });
    const insert = calls.find((c) => c.ops[0] === "insert");
    expect(insert?.payloads[0]).toEqual(expect.objectContaining({ subject_type: "agreement_client_signature", approver_person_id: "person-signer", state: "pending" }));
  });
});

describe("needsInvoice: one invoice per agreement", () => {
  const signed = (invoice?: unknown): Agreement => ({
    id: "agr-1",
    status: "signed",
    header,
    client: { name: "Sam", title: "Director", email: "sam@example.test", signedAt: "x", ip: null, userAgent: null, authUserId: "a", personId: "p", sha256Shown: SHA, ...(invoice ? { invoice } : {}) } as Agreement["client"],
    preparedAt: "x",
    sentAt: "x",
  });
  it("wants an invoice for a signed agreement with none, or with only a failed attempt", () => {
    expect(needsInvoice(signed())).toBe(true);
    expect(needsInvoice(signed({ error: "no QuickBooks customer", at: "x" }))).toBe(true);
  });
  it("never wants a second one once raised", () => {
    expect(needsInvoice(signed({ qboId: "q1", docNumber: "1001", ledgerId: null, amountCents: 1, currency: "aud", emailed: true }))).toBe(false);
  });
  it("wants none before the client has signed", () => {
    expect(needsInvoice({ ...signed(), status: "sent", client: null })).toBe(false);
  });
  it("wants none for a client agreement with no fee", () => {
    expect(needsInvoice({ ...signed(), header: { ...header, fee: null } })).toBe(false);
  });
});

describe("renderAgreementHtml", () => {
  it("drops script tags and event handlers from an uploaded agreement", async () => {
    const html = await renderAgreementHtml('# Terms\n\n<script>alert(1)</script>\n\n<img src="x" onerror="alert(2)">\n\n<a href="javascript:alert(3)">click</a>\n\nPlain **text** stays.');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/onerror/i);
    expect(html).not.toMatch(/javascript:/i);
    expect(html).toContain("<strong>text</strong>");
  });
});

describe("completeSignedAgreement: who is told (AC.15)", () => {
  const signedMeta = {
    name: "Sam Signer",
    title: "Director",
    email: "sam@example.test",
    signedAt: "2026-10-06T02:00:00Z",
    ip: null,
    userAgent: null,
    authUserId: "auth-1",
    personId: "person-signer",
    sha256Shown: SHA,
    signedCopyDocumentId: "doc-1",
    signedCopyPath: "company/co-1/agreements/signed.html",
  };
  const arrange = () => {
    vi.mocked(sendTransactionalEmail).mockClear();
    scriptAgreement();
    script("approvals", { data: [edge8Row("approved"), clientRow("approved", signedMeta)] }, { data: { id: "ap-2", metadata: {} } }, { data: [{ id: "ap-2" }] });
    script("deals", { error: null });
  };
  const recipients = () => vi.mocked(sendTransactionalEmail).mock.calls.map((c) => c[0].to);

  it("emails the client, and Edge8's signer a link to the deal when they may open it", async () => {
    arrange();
    expect(await completeSignedAgreement("agr-1", "https://edge8.test")).toEqual({ ok: true });
    expect(recipients()).toEqual(["sam@example.test", "dave@edge8.test"]);
    const edge8Mail = vi.mocked(sendTransactionalEmail).mock.calls[1][0];
    expect(edge8Mail.html).toContain("https://edge8.test/admin/revenue/deals/deal-1");
  });

  it("does not email Edge8's signer a link to a deal they may not open, and still emails the client", async () => {
    arrange();
    cannotOpen.add("dave@edge8.test");
    expect(await completeSignedAgreement("agr-1", "https://edge8.test")).toEqual({ ok: true });
    expect(recipients()).toEqual(["sam@example.test"]);
  });

  // A client agreement with a fee is told to ops by its invoice; one with no
  // fee raises none, so the signature is told here instead.
  it("tells ops a client signed an agreement with no fee, and stays quiet when an invoice will", async () => {
    vi.mocked(notifyOps).mockClear();
    arrange();
    expect(await completeSignedAgreement("agr-1", "https://edge8.test")).toEqual({ ok: true });
    expect(vi.mocked(notifyOps)).not.toHaveBeenCalled();

    resetFake();
    scriptAgreement(agreementRow({ fee_amount_cents: null, fee_currency: null, fee_description: null }));
    script("approvals", { data: [edge8Row("approved"), clientRow("approved", signedMeta)] }, { data: { id: "ap-2", metadata: {} } }, { data: [{ id: "ap-2" }] });
    script("deals", { error: null });
    expect(await completeSignedAgreement("agr-1", "https://edge8.test")).toEqual({ ok: true });
    expect(vi.mocked(notifyOps)).toHaveBeenCalledWith(expect.stringContaining("Sam Signer signed Master Services Agreement"));
  });
});

describe("readAgreementFile: only what the signing page can show", () => {
  const b64 = (text: string) => Buffer.from(text).toString("base64");
  it("takes Markdown as text and a PDF by its header", () => {
    expect(readAgreementFile("msa.md", b64(TEXT))).toEqual(expect.objectContaining({ ok: true, contentType: "text/markdown" }));
    expect(readAgreementFile("Contract.PDF", b64("%PDF-1.7\n..."))).toEqual(expect.objectContaining({ ok: true, contentType: "application/pdf" }));
  });
  it("refuses a .pdf that is not a PDF, another file type, and an empty file", () => {
    expect(readAgreementFile("contract.pdf", b64("<html>not a pdf</html>"))).toEqual({ ok: false, error: "The file is not a PDF." });
    expect(readAgreementFile("contract.docx", b64("PK..."))).toEqual({ ok: false, error: expect.stringContaining("Markdown (.md) or PDF (.pdf)") });
    expect(readAgreementFile("blank.md", b64("   \n"))).toEqual({ ok: false, error: "The agreement file is empty." });
  });
});

describe("contractor agreements (AG.1)", () => {
  const teamActor = (over: Partial<{ personId: string | null; impersonating: boolean }> = {}) => ({
    personId: "person-hoan",
    email: "hoan@edge8.test",
    authUserId: "auth-hoan",
    impersonating: false,
    ...over,
  });
  const teamSign = (over: Partial<Parameters<typeof signAgreementAsTeamMember>[0]> = {}) => ({
    agreementId: "agr-1",
    actor: teamActor(),
    typedName: "Hoan Ngo",
    title: "English Trainer",
    consent: true,
    sha256Shown: SHA,
    evidence: { ip: "203.0.113.9", userAgent: "test" },
    ...over,
  });

  it("is never shown in the Client Portal, even to an account with the signer's email", async () => {
    scriptAgreement(contractorRow());
    script("approvals", { data: [edge8Row("approved"), clientRow("pending")] });
    const { getAgreement } = await import("./agreements");
    const a = await getAgreement("agr-1");
    expect(a?.header.type).toBe("contractor");
    expect(a && mayClientSee({ email: "hoan@edge8.test", companyScope: ["co-1"] }, a)).toBe(false);
  });

  it("refuses an admin viewing the Team pages as the signer, before reading anything", async () => {
    const r = await signAgreementAsTeamMember(teamSign({ actor: teamActor({ impersonating: true }) }));
    expect(r).toEqual({ ok: false, error: expect.stringContaining("admin") });
    expect(calls).toHaveLength(0);
  });

  it("refuses a team member who is not the named signer as not found", async () => {
    scriptAgreement(contractorRow());
    script("approvals", { data: [edge8Row("approved"), clientRow("pending")] });
    const r = await signAgreementAsTeamMember(teamSign({ actor: teamActor({ personId: "person-other" }) }));
    expect(r).toEqual({ ok: false, error: "Agreement not found." });
    expect(calls.some((c) => c.ops.includes("update"))).toBe(false);
  });

  it("takes the named signer's signature with their login as evidence", async () => {
    scriptAgreement(contractorRow());
    script("approvals", { data: [edge8Row("approved"), clientRow("pending")] }, { data: { id: "ap-2", metadata: { label: "x" } } }, { data: [{ id: "ap-2" }] });
    const r = await signAgreementAsTeamMember(teamSign());
    expect(r.ok).toBe(true);
    const update = calls.find((c) => c.ops[0] === "update");
    expect(update?.payloads[0]).toEqual(
      expect.objectContaining({ state: "approved", decided_by: "person-hoan", metadata: expect.objectContaining({ name: "Hoan Ngo", authUserId: "auth-hoan", sha256Shown: SHA }) }),
    );
  });

  it("is sent with a link to the Team pages, not the portal", async () => {
    vi.mocked(sendTransactionalEmail).mockClear();
    scriptAgreement(contractorRow());
    script("approvals", { data: [edge8Row("approved")] }, { data: null }, { error: null });
    const r = await sendAgreement({ agreementId: "agr-1", sentBy: "dave@edge8.test", origin: "https://edge8.test" });
    expect(r).toEqual({ ok: true, emailed: true });
    const mail = vi.mocked(sendTransactionalEmail).mock.calls[0][0];
    expect(mail.to).toBe("hoan@edge8.test");
    expect(mail.html).toContain("https://edge8.test/team/agreements/agr-1");
    expect(mail.html).not.toContain("/portal/");
  });

  it("once signed, emails both parties, tells the Operations chat, touches no deal and wants no invoice", async () => {
    vi.mocked(sendTransactionalEmail).mockClear();
    vi.mocked(notifyOps).mockClear();
    const signed = { name: "Hoan Ngo", title: "English Trainer", email: "hoan@edge8.test", signedAt: "2026-10-12T02:00:00Z", ip: null, userAgent: null, authUserId: "auth-hoan", personId: "person-hoan", sha256Shown: SHA, signedCopyPath: "team/tm-1/agreements/signed.html" };
    scriptAgreement(contractorRow());
    script("approvals", { data: [edge8Row("approved"), clientRow("approved", signed)] }, { data: { id: "ap-2", metadata: {} } }, { data: [{ id: "ap-2" }] });
    expect(await completeSignedAgreement("agr-1", "https://edge8.test")).toEqual({ ok: true });
    const mails = vi.mocked(sendTransactionalEmail).mock.calls.map((c) => c[0]);
    expect(mails.map((m) => m.to)).toEqual(["hoan@edge8.test", "dave@edge8.test"]);
    expect(mails[0].html).toContain("https://edge8.test/team/agreements/agr-1");
    expect(mails[1].html).toContain("https://edge8.test/admin/agreements");
    expect(vi.mocked(notifyOps)).toHaveBeenCalledWith(expect.stringContaining("Hoan Ngo signed Master Services Agreement (contractor agreement)"));
    expect(calls.some((c) => c.table === "deals")).toBe(false);
  });
});

import { companyOs } from "@/kernel/data/supabase";
import { recordAudit } from "@/kernel/audit/audit";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { notifyOps } from "@/kernel/messaging/lark";
import { personIdForEmailOrNull } from "@/kernel/identity/person-by-email";
import { recipientMayOpenByEmail } from "@/kernel/identity/may-open";
import { annotateApproval, cancelApproval, decidePendingApproval, openApproval } from "@/kernel/approvals/requests";
import type { PortalActor } from "@/kernel/identity/portal-auth";
import { recordDocument, uploadAgreementBytes, type AgreementOwner } from "@/entities/client-programs";
import { agreementEmail, pdfAgreementSummaryHtml, renderSignedCopy, type SignatureBlock } from "./agreement-render";
import { readAgreementHtml, storedFingerprintMatches } from "./agreement-documents";
import {
  AGREEMENT_CLIENT,
  AGREEMENT_EDGE8,
  AGREEMENT_STATUS_LABEL,
  AGREEMENT_TYPE_LABEL,
  getAgreement,
  mayTeamMemberSee,
  type Agreement,
  type AgreementInvoice,
  type ClientSignature,
} from "./agreements";

// The steps that write an agreement after it is prepared (E-signature): sign
// it for Edge8, send it, take the other party's signature, then the signed
// copy and the emails. Preparing it is ./agreement-prepare.ts; the model, its
// status and its readers are ./agreements.ts.
// Nothing here guards: the actions that call it do, inline (ADR 0007).

// ── Where things point ──────────────────────────────────────────────────────

/** Where the other party opens and signs the agreement. */
export function signingPath(a: Agreement): string {
  return a.header.type === "client" ? `/portal/agreements/${a.id}` : `/team/agreements/${a.id}`;
}

/** Where Edge8 manages it: the deal for a client, the agreements list otherwise. */
export function adminPath(a: Agreement): string {
  return a.header.type === "client" && a.header.dealId ? `/admin/revenue/deals/${a.header.dealId}` : "/admin/agreements";
}

/** Who the agreement is with, as a line names them. */
export function partyName(a: Agreement): string {
  return a.header.type === "client" ? (a.header.companyName ?? "the client") : a.header.signer.name;
}

// A client agreement's history stays on its deal, where it always was; every
// other agreement's on its own row.
function auditTarget(a: Agreement): { table: string; recordId: string } {
  return a.header.type === "client" && a.header.dealId ? { table: "deals", recordId: a.header.dealId } : { table: "agreements", recordId: a.id };
}

// ── Edge8 signs, then sends ─────────────────────────────────────────────────

export type SignEvidence = { ip: string | null; userAgent: string | null };

export async function signAgreementForEdge8(input: {
  agreementId: string;
  signer: { name: string; title: string; email: string };
  evidence: SignEvidence;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const name = input.signer.name.trim();
  const title = input.signer.title.trim();
  if (!name) return { ok: false, error: "Type your full name to sign." };
  if (!title) return { ok: false, error: "Give your title." };
  const a = await getAgreement(input.agreementId);
  if (!a) return { ok: false, error: "Agreement not found." };
  if (a.status !== "draft") return { ok: false, error: `This agreement is not waiting for Edge8's signature (${AGREEMENT_STATUS_LABEL[a.status]}).` };
  const stored = await storedFingerprintMatches(a.header);
  if (!stored.ok) return stored;

  const edge8 = { name, title, email: input.signer.email, signedAt: new Date().toISOString(), ip: input.evidence.ip, userAgent: input.evidence.userAgent };
  const decided = await decidePendingApproval(
    {
      subjectType: AGREEMENT_EDGE8,
      subjectId: a.id,
      state: "approved",
      decidedBy: await personIdForEmailOrNull(input.signer.email, "crm/agreements"),
      metadata: { edge8 },
    },
    input.signer.email,
  );
  if (!decided.ok) return decided;
  if (!decided.decided) return { ok: false, error: "This agreement was already signed for Edge8 or voided." };
  return { ok: true };
}

/** Opens the other party's signature and emails the signer. Refused until Edge8 has signed. */
export async function sendAgreement(input: {
  agreementId: string;
  sentBy: string;
  origin: string;
}): Promise<{ ok: true; emailed: boolean } | { ok: false; error: string }> {
  const a = await getAgreement(input.agreementId);
  if (!a) return { ok: false, error: "Agreement not found." };
  if (a.status === "draft") return { ok: false, error: "Sign the agreement for Edge8 before sending it." };
  if (a.status !== "edge8_signed") return { ok: false, error: `This agreement cannot be sent (${AGREEMENT_STATUS_LABEL[a.status]}).` };
  if (!input.origin) return { ok: false, error: "The site address is not known (NEXT_PUBLIC_SITE_URL), so the email would carry no link." };

  const opened = await openApproval(
    {
      subjectType: AGREEMENT_CLIENT,
      subjectId: a.id,
      requestedBy: await personIdForEmailOrNull(input.sentBy, "crm/agreements"),
      approverPersonId: a.header.signer.personId,
      label: `${a.header.signer.name} to sign ${a.header.title}`,
    },
    input.sentBy,
  );
  if (!opened.ok) return { ok: false, error: `Could not send: ${opened.error}` };

  const client = a.header.type === "client";
  const emailed = await sendTransactionalEmail({
    to: a.header.signer.email,
    subject: `${a.header.title}: ready for your signature`,
    html: agreementEmail({
      lines: [
        `Hi ${a.header.signer.name},`,
        client
          ? `${a.header.title} between ${a.header.companyName ?? "your company"} and Edge8 is ready for your signature. Edge8 has already signed it.`
          : `${a.header.title} between you and Edge8 is ready for your signature. Edge8 has already signed it.`,
        client
          ? "Open it in the Client Portal, read it, and sign by typing your name."
          : "Open it in Edge8's Team pages with your usual sign-in, read it, and sign by typing your name.",
      ],
      button: { label: "Review and sign", href: `${input.origin}${signingPath(a)}` },
    }),
    idempotencyKey: `agreement-sent-${a.id}`,
    logMeta: { agreement_id: a.id, ...(a.header.dealId ? { deal_id: a.header.dealId } : {}) },
  });
  await recordAudit({ ...auditTarget(a), operation: "update", actor: input.sentBy, context: { action: "agreement_sent", agreementId: a.id, emailed } });
  return { ok: true, emailed };
}

// ── The other party signs ───────────────────────────────────────────────────

type SignatureInput = {
  typedName: string;
  title: string;
  consent: boolean;
  sha256Shown: string;
  evidence: SignEvidence;
};

type Signed = { ok: true; agreement: Agreement } | { ok: false; error: string };

// Takes the signature once the caller has decided this signer may sign this
// agreement: the typed name, the consent, the fingerprint they were shown and
// the fingerprint of the file as stored now.
async function takeSignature(a: Agreement, signer: { personId: string; email: string; authUserId: string | null }, input: SignatureInput): Promise<Signed> {
  if (a.status !== "sent") return { ok: false, error: "This agreement is not waiting for a signature." };
  const typedName = input.typedName.trim();
  const title = input.title.trim();
  if (!typedName) return { ok: false, error: "Type your full name to sign." };
  if (!title) return { ok: false, error: "Give your title." };
  if (!input.consent) return { ok: false, error: "Tick the box to confirm you agree to it." };
  if (input.sha256Shown !== a.header.sha256) {
    return { ok: false, error: "The agreement changed while you had it open. Reload the page and read it again before signing." };
  }
  const stored = await storedFingerprintMatches(a.header);
  if (!stored.ok) return stored;

  const evidence: ClientSignature = {
    name: typedName,
    title,
    email: signer.email,
    signedAt: new Date().toISOString(),
    ip: input.evidence.ip,
    userAgent: input.evidence.userAgent,
    authUserId: signer.authUserId,
    personId: signer.personId,
    sha256Shown: input.sha256Shown,
  };
  const decided = await decidePendingApproval(
    { subjectType: AGREEMENT_CLIENT, subjectId: a.id, state: "approved", decidedBy: signer.personId, metadata: evidence },
    signer.email,
  );
  if (!decided.ok) return { ok: false, error: "Your signature could not be recorded. Please try again." };
  if (!decided.decided) return { ok: false, error: "This agreement has already been signed." };
  return { ok: true, agreement: { ...a, status: "signed", client: evidence } };
}

export async function signAgreementAsClient(
  input: SignatureInput & {
    agreementId: string;
    actor: Pick<PortalActor, "authUserId" | "personId" | "email" | "companyScope" | "impersonation">;
  },
): Promise<Signed> {
  const { actor } = input;
  if (actor.impersonation) return { ok: false, error: "An Edge8 admin viewing the portal cannot sign for the client." };
  const a = await getAgreement(input.agreementId);
  if (!a || a.header.type !== "client" || !a.header.companyId || !actor.companyScope.includes(a.header.companyId)) {
    return { ok: false, error: "Agreement not found." };
  }
  if (actor.email.trim().toLowerCase() !== a.header.signer.email.trim().toLowerCase()) {
    return { ok: false, error: `This agreement is addressed to ${a.header.signer.name}. Only they can sign it.` };
  }
  return takeSignature(a, { personId: actor.personId, email: actor.email, authUserId: actor.authUserId }, input);
}

/** An employee or contractor signs their own agreement in the Team pages. */
export async function signAgreementAsTeamMember(
  input: SignatureInput & {
    agreementId: string;
    actor: { personId: string | null; email: string; authUserId: string; impersonating: boolean };
  },
): Promise<Signed> {
  const { actor } = input;
  if (actor.impersonating) return { ok: false, error: "An admin viewing the Team pages as someone else cannot sign for them." };
  const a = await getAgreement(input.agreementId);
  if (!a || !actor.personId || !mayTeamMemberSee(actor.personId, a)) return { ok: false, error: "Agreement not found." };
  return takeSignature(a, { personId: actor.personId, email: actor.email, authUserId: actor.authUserId }, input);
}

// ── After both have signed ──────────────────────────────────────────────────

function signatureBlocks(a: Agreement): SignatureBlock[] {
  const blocks: SignatureBlock[] = [];
  if (a.header.edge8) blocks.push({ party: "Edge8", ...a.header.edge8 });
  if (a.client) {
    const c = a.client;
    const party = a.header.type === "client" ? (a.header.companyName ?? "Client") : AGREEMENT_TYPE_LABEL[a.header.type];
    blocks.push({ party, name: c.name, title: c.title, email: c.email, signedAt: c.signedAt, ip: c.ip, userAgent: c.userAgent });
  }
  return blocks;
}

function ownerOf(a: Agreement): AgreementOwner | null {
  if (a.header.companyId) return { companyId: a.header.companyId };
  if (a.header.teamMemberId) return { teamMemberId: a.header.teamMemberId };
  if (a.header.vendorId) return { vendorId: a.header.vendorId };
  return null;
}

// The signed copy: the Markdown agreement as both parties saw it, or, for a
// PDF, a record that names the PDF by its fingerprint. Either way the stored
// file the fingerprint pins is the agreement; this is the record of who signed.
async function writeSignedCopy(a: Agreement): Promise<{ ok: true } | { ok: false; error: string }> {
  const owner = ownerOf(a);
  if (!owner) return { ok: false, error: "The agreement names no party to file its signed copy under." };
  let agreementHtml: string;
  if (a.header.contentType === "text/markdown") {
    const html = await readAgreementHtml(a);
    if (!html.ok) return html;
    agreementHtml = html.html;
  } else {
    const stored = await storedFingerprintMatches(a.header);
    if (!stored.ok) return stored;
    agreementHtml = pdfAgreementSummaryHtml({ title: a.header.title, filename: a.header.filename });
  }
  const copy = renderSignedCopy({ title: a.header.title, agreementHtml, sha256: a.header.sha256, agreementId: a.id, signatures: signatureBlocks(a) });
  const bytes = new TextEncoder().encode(copy);
  const filename = `${a.header.title} (signed).html`;
  const stored = await uploadAgreementBytes({ owner, filename, bytes, contentType: "text/html; charset=utf-8" });
  if (!stored.ok) return stored;
  const metadata: Record<string, string> = { signedCopyPath: stored.path };
  if ("companyId" in owner) {
    const recorded = await recordDocument({ companyId: owner.companyId, path: stored.path, filename, sizeBytes: bytes.byteLength, uploadedBy: a.header.preparedBy ?? "agreements" });
    if (!recorded.ok) return recorded;
    if (recorded.id) metadata.signedCopyDocumentId = recorded.id;
  }
  return annotateApproval({ subjectType: AGREEMENT_CLIENT, subjectId: a.id, metadata });
}

/**
 * Writes the signed copy, points a client deal's contract link at the
 * agreement, and emails both parties. Each step records itself on the
 * signature, so a second run (a retry, a double submit) does only what the
 * first did not.
 */
export async function completeSignedAgreement(agreementId: string, origin: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await getAgreement(agreementId);
  if (!a || a.status !== "signed" || !a.client) return { ok: false, error: "The agreement is not signed by both parties." };

  if (!a.client.signedCopyPath) {
    const written = await writeSignedCopy(a);
    if (!written.ok) return written;
  }

  if (origin && a.header.type === "client" && a.header.dealId) {
    const contractUrl = `${origin}${signingPath(a)}`;
    const { error } = await companyOs.from("deals").update({ contract_url: contractUrl }).eq("id", a.header.dealId);
    if (error) console.error(`[crm/agreements] deal ${a.header.dealId} contract_url:`, error.message);
    else await recordAudit({ table: "deals", recordId: a.header.dealId, operation: "update", actor: "agreements", newData: { contract_url: contractUrl } });
  }

  if (!a.client.emailedAt && origin) {
    const client = a.header.type === "client";
    const logMeta = { agreement_id: a.id, ...(a.header.dealId ? { deal_id: a.header.dealId } : {}) };
    await sendTransactionalEmail({
      to: a.client.email,
      subject: `${a.header.title}: signed by both parties`,
      html: agreementEmail({
        lines: [
          `Hi ${a.header.signer.name},`,
          `Thank you. ${a.header.title} is now signed by you and by Edge8. Your signed copy is in ${client ? "the Client Portal" : "Edge8's Team pages"}.`,
        ],
        button: { label: "Open the signed agreement", href: `${origin}${signingPath(a)}` },
      }),
      idempotencyKey: `agreement-signed-${a.id}-client`,
      logMeta,
    });
    // Edge8's signer is told with a link to where the agreement is managed,
    // and a link goes only to someone who may open that page (AC.15, ADR
    // 0013). The signature is already recorded, so a lookup that fails sends
    // this one email to no one rather than failing the signing.
    const managePath = adminPath(a);
    const signerMayOpen = a.header.edge8
      ? await recipientMayOpenByEmail(a.header.edge8.email)
          .then((may) => may(managePath))
          .catch((err) => {
            console.error("[crm/agreements] signer access:", err instanceof Error ? err.message : err);
            return false;
          })
      : false;
    if (a.header.edge8 && signerMayOpen) {
      await sendTransactionalEmail({
        to: a.header.edge8.email,
        subject: `${client ? (a.header.companyName ?? "The client") : a.header.signer.name} signed ${a.header.title}`,
        html: agreementEmail({
          lines: [`${a.client.name} (${a.client.title}) signed ${a.header.title} on ${new Date(a.client.signedAt).toUTCString()}.`],
          button: { label: client ? "Open the deal" : "Open the agreements", href: `${origin}${managePath}` },
        }),
        idempotencyKey: `agreement-signed-${a.id}-edge8`,
        logMeta,
      });
    }
    // A client's signature with a fee is told to the Operations chat by its
    // invoice; every other agreement has none, so it is told here.
    if (!client || !a.header.fee) await notifyOps(`${a.header.signer.name} signed ${a.header.title} (${AGREEMENT_TYPE_LABEL[a.header.type].toLowerCase()} agreement).`);
    await annotateApproval({ subjectType: AGREEMENT_CLIENT, subjectId: a.id, metadata: { emailedAt: new Date().toISOString() } });
  }
  return { ok: true };
}

/**
 * Everything after a team member's signature. Never throws and never fails
 * the signature: they have signed whatever happens here, and what did not
 * happen is logged and told to ops for a human to finish.
 */
export async function afterTeamMemberSigned(agreementId: string, origin: string): Promise<void> {
  try {
    const done = await completeSignedAgreement(agreementId, origin);
    if (!done.ok) {
      console.error(`[crm/agreements] completing ${agreementId}:`, done.error);
      await notifyOps(`⚠️ Agreement ${agreementId} was signed, but the signed copy or emails failed: ${done.error}`);
    }
  } catch (e) {
    console.error(`[crm/agreements] completing ${agreementId} threw:`, e);
  }
}

/** Records what happened when the agreement's invoice was raised. */
export async function recordAgreementInvoice(agreementId: string, invoice: AgreementInvoice): Promise<{ ok: true } | { ok: false; error: string }> {
  return annotateApproval({ subjectType: AGREEMENT_CLIENT, subjectId: agreementId, metadata: { invoice } });
}

/** Whether the agreement still needs its invoice raised: a signed client agreement with a fee and no invoice on record. */
export function needsInvoice(a: Agreement): boolean {
  return a.header.type === "client" && !!a.header.fee && a.status === "signed" && !!a.client && !(a.client.invoice && "qboId" in a.client.invoice);
}

/** Withdraws an agreement not yet signed by the other party. */
export async function voidAgreement(input: { agreementId: string; by: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await getAgreement(input.agreementId);
  if (!a) return { ok: false, error: "Agreement not found." };
  if (a.status === "signed") return { ok: false, error: "A signed agreement cannot be voided here." };
  if (a.status === "void") return { ok: true };
  const cancelledBy = await personIdForEmailOrNull(input.by, "crm/agreements");
  const subjectType = a.status === "sent" ? AGREEMENT_CLIENT : AGREEMENT_EDGE8;
  const r = await cancelApproval({ subjectType, subjectId: a.id, cancelledBy }, input.by);
  if (!r.ok) return r;
  await recordAudit({ ...auditTarget(a), operation: "update", actor: input.by, context: { action: "agreement_voided", agreementId: a.id } });
  return { ok: true };
}

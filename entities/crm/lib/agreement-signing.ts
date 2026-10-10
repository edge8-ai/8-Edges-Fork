import { z } from "zod";
import { companyOs } from "@/kernel/data/supabase";
import { recordAudit } from "@/kernel/audit/audit";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { personIdForEmail, personIdForEmailOrNull } from "@/kernel/identity/person-by-email";
import { recipientMayOpenByEmail } from "@/kernel/identity/may-open";
import { annotateApproval, cancelApproval, decidePendingApproval, openApproval } from "@/kernel/approvals/requests";
import type { PortalActor } from "@/kernel/identity/portal-auth";
import { recordDocument, uploadAgreementBytes } from "@/entities/client-programs";
import { agreementEmail, renderSignedCopy, type SignatureBlock } from "./agreement-render";
import {
  AGREEMENT_CLIENT,
  AGREEMENT_EDGE8,
  AGREEMENT_STATUS_LABEL,
  getAgreement,
  readAgreementHtml,
  sha256Hex,
  storedFingerprintMatches,
  type Agreement,
  type AgreementHeader,
  type AgreementInvoice,
  type ClientSignature,
} from "./agreements";

// The steps that write an agreement (E-signature): prepare it, sign it for
// Edge8, send it, take the client's signature, then the signed copy and the
// invoice record. The model, its status and its readers are ./agreements.ts.
// Nothing here guards: the actions that call it do, inline (ADR 0007).

const MAX_MARKDOWN_BYTES = 300_000;

// ── Prepare ─────────────────────────────────────────────────────────────────

export const prepareAgreementSchema = z.object({
  dealId: z.string().uuid(),
  markdown: z.string().trim().min(1, "The agreement file is empty."),
  filename: z.string().trim().min(1),
  title: z.string().trim().min(1, "Give the agreement a title."),
  signer: z.object({
    name: z.string().trim().min(1, "Name the client's signer."),
    title: z.string().trim().min(1, "Give the signer's title."),
    email: z.string().trim().email("Give the signer's email."),
  }),
  fee: z.object({
    amount: z.number().positive("The fee must be more than zero."),
    currency: z.string().trim().regex(/^[A-Za-z]{3}$/, "Currency is a three-letter code, such as AUD."),
    description: z.string().trim().min(1, "Describe what the invoice is for."),
  }),
  preparedBy: z.string().trim().email(),
});
export type PrepareAgreementInput = z.input<typeof prepareAgreementSchema>;

/**
 * Stores the agreement and opens Edge8's signature on it. Refuses a signer who
 * has no portal access to the deal's company, because only that account can
 * sign. Warns, without refusing, when the company has no QuickBooks customer,
 * since the invoice raised at signature would then need a human.
 */
export async function prepareAgreement(
  input: PrepareAgreementInput,
): Promise<{ ok: true; agreementId: string; warnings: string[] } | { ok: false; error: string }> {
  const parsed = prepareAgreementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid agreement." };
  const v = parsed.data;
  const bytes = new TextEncoder().encode(v.markdown);
  if (bytes.byteLength > MAX_MARKDOWN_BYTES) return { ok: false, error: "The agreement file is too large." };

  const { data: deal, error: dealErr } = await companyOs
    .from("deals")
    .select("id, company_id, companies!company_id(name, metadata)")
    .eq("id", v.dealId)
    .maybeSingle();
  if (dealErr) return { ok: false, error: `Could not read the deal: ${dealErr.message}` };
  if (!deal) return { ok: false, error: "Deal not found." };
  if (!deal.company_id) return { ok: false, error: "The deal has no company. Set one before preparing an agreement." };
  const companyId = deal.company_id;
  const company = (Array.isArray(deal.companies) ? deal.companies[0] : deal.companies) as { name: string | null; metadata: unknown } | null;

  let signerPersonId: string | null;
  try {
    signerPersonId = await personIdForEmail(v.signer.email);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not look up the signer." };
  }
  const invite = `Invite ${v.signer.name} to the portal first, from the company's People & access tab.`;
  if (!signerPersonId) return { ok: false, error: invite };
  const { data: member, error: memberErr } = await companyOs
    .from("portal_members")
    .select("id")
    .eq("company_id", companyId)
    .eq("person_id", signerPersonId)
    .eq("status", "active")
    .maybeSingle();
  if (memberErr) return { ok: false, error: `Could not check the signer's portal access: ${memberErr.message}` };
  if (!member) return { ok: false, error: invite };

  const stored = await uploadAgreementBytes({ companyId, filename: v.filename, bytes, contentType: "text/markdown; charset=utf-8" });
  if (!stored.ok) return { ok: false, error: stored.error };
  const recorded = await recordDocument({ companyId, path: stored.path, filename: v.filename, sizeBytes: bytes.byteLength, uploadedBy: v.preparedBy });
  if (!recorded.ok) return { ok: false, error: recorded.error };
  if (!recorded.id) return { ok: false, error: "The agreement was stored but its record id did not come back." };
  const agreementId = recorded.id;

  const header: AgreementHeader = {
    dealId: v.dealId,
    companyId,
    companyName: company?.name ?? null,
    title: v.title,
    filename: v.filename,
    storagePath: stored.path,
    sha256: sha256Hex(bytes),
    signer: { name: v.signer.name, title: v.signer.title, email: v.signer.email, personId: signerPersonId },
    fee: { cents: Math.round(v.fee.amount * 100), currency: v.fee.currency.toLowerCase(), description: v.fee.description },
    preparedBy: v.preparedBy,
  };
  const preparer = await personIdForEmailOrNull(v.preparedBy, "crm/agreements");
  const opened = await openApproval(
    {
      subjectType: AGREEMENT_EDGE8,
      subjectId: agreementId,
      requestedBy: preparer,
      approverPersonId: preparer,
      label: `Sign ${v.title} for ${company?.name ?? "the client"}`,
      metadata: header,
    },
    v.preparedBy,
  );
  if (!opened.ok) return { ok: false, error: `The file is stored, but Edge8's signature could not be opened: ${opened.error}` };
  await recordAudit({ table: "deals", recordId: v.dealId, operation: "update", actor: v.preparedBy, context: { action: "agreement_prepared", agreementId, sha256: header.sha256 } });

  const warnings: string[] = [];
  const qboIds = (company?.metadata as { qbo_customer_ids?: unknown } | null)?.qbo_customer_ids;
  if (!Array.isArray(qboIds) || qboIds.length === 0) {
    warnings.push(`${company?.name ?? "The company"} has no QuickBooks customer. The invoice will not be raised when the client signs until one is mapped.`);
  }
  return { ok: true, agreementId, warnings };
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

/** Opens the client's signature and emails the signer. Refused until Edge8 has signed. */
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

  const link = `${input.origin}/portal/agreements/${a.id}`;
  const emailed = await sendTransactionalEmail({
    to: a.header.signer.email,
    subject: `${a.header.title}: ready for your signature`,
    html: agreementEmail({
      lines: [
        `Hi ${a.header.signer.name},`,
        `${a.header.title} between ${a.header.companyName ?? "your company"} and Edge8 is ready for your signature. Edge8 has already signed it.`,
        "Open it in the Client Portal, read it, and sign by typing your name.",
      ],
      button: { label: "Review and sign", href: link },
    }),
    idempotencyKey: `agreement-sent-${a.id}`,
    logMeta: { agreement_id: a.id, deal_id: a.header.dealId },
  });
  await recordAudit({ table: "deals", recordId: a.header.dealId, operation: "update", actor: input.sentBy, context: { action: "agreement_sent", agreementId: a.id, emailed } });
  return { ok: true, emailed };
}

// ── The client signs ────────────────────────────────────────────────────────

export async function signAgreementAsClient(input: {
  agreementId: string;
  actor: Pick<PortalActor, "authUserId" | "personId" | "email" | "companyScope" | "impersonation">;
  typedName: string;
  title: string;
  consent: boolean;
  sha256Shown: string;
  evidence: SignEvidence;
}): Promise<{ ok: true; agreement: Agreement } | { ok: false; error: string }> {
  const { actor } = input;
  if (actor.impersonation) return { ok: false, error: "An Edge8 admin viewing the portal cannot sign for the client." };
  const a = await getAgreement(input.agreementId);
  if (!a || !actor.companyScope.includes(a.header.companyId)) return { ok: false, error: "Agreement not found." };
  if (actor.email.trim().toLowerCase() !== a.header.signer.email.trim().toLowerCase()) {
    return { ok: false, error: `This agreement is addressed to ${a.header.signer.name}. Only they can sign it.` };
  }
  if (a.status !== "sent") return { ok: false, error: "This agreement is not waiting for a signature." };
  const typedName = input.typedName.trim();
  const title = input.title.trim();
  if (!typedName) return { ok: false, error: "Type your full name to sign." };
  if (!title) return { ok: false, error: "Give your title." };
  if (!input.consent) return { ok: false, error: "Tick the box to confirm you agree and are authorised to sign." };
  if (input.sha256Shown !== a.header.sha256) {
    return { ok: false, error: "The agreement changed while you had it open. Reload the page and read it again before signing." };
  }
  const stored = await storedFingerprintMatches(a.header);
  if (!stored.ok) return stored;

  const evidence: ClientSignature = {
    name: typedName,
    title,
    email: actor.email,
    signedAt: new Date().toISOString(),
    ip: input.evidence.ip,
    userAgent: input.evidence.userAgent,
    authUserId: actor.authUserId,
    personId: actor.personId,
    sha256Shown: input.sha256Shown,
  };
  const decided = await decidePendingApproval(
    { subjectType: AGREEMENT_CLIENT, subjectId: a.id, state: "approved", decidedBy: actor.personId, metadata: evidence },
    actor.email,
  );
  if (!decided.ok) return { ok: false, error: "Your signature could not be recorded. Please try again." };
  if (!decided.decided) return { ok: false, error: "This agreement has already been signed." };
  return { ok: true, agreement: { ...a, status: "signed", client: evidence } };
}

// ── After both have signed ──────────────────────────────────────────────────

function signatureBlocks(a: Agreement): SignatureBlock[] {
  const blocks: SignatureBlock[] = [];
  if (a.header.edge8) blocks.push({ party: "Edge8", ...a.header.edge8 });
  if (a.client) {
    const c = a.client;
    blocks.push({ party: a.header.companyName ?? "Client", name: c.name, title: c.title, email: c.email, signedAt: c.signedAt, ip: c.ip, userAgent: c.userAgent });
  }
  return blocks;
}

/**
 * Writes the signed copy, points the deal's contract link at the agreement and
 * emails both parties. Each step records itself on the client signature, so a
 * second run (a retry, a double submit) does only what the first did not.
 */
export async function completeSignedAgreement(agreementId: string, origin: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await getAgreement(agreementId);
  if (!a || a.status !== "signed" || !a.client) return { ok: false, error: "The agreement is not signed by both parties." };
  const ref = { subjectType: AGREEMENT_CLIENT, subjectId: a.id } as const;

  if (!a.client.signedCopyDocumentId) {
    const html = await readAgreementHtml(a);
    if (!html.ok) return html;
    const copy = renderSignedCopy({ title: a.header.title, agreementHtml: html.html, sha256: a.header.sha256, agreementId: a.id, signatures: signatureBlocks(a) });
    const bytes = new TextEncoder().encode(copy);
    const filename = `${a.header.title} (signed).html`;
    const stored = await uploadAgreementBytes({ companyId: a.header.companyId, filename, bytes, contentType: "text/html; charset=utf-8" });
    if (!stored.ok) return stored;
    const recorded = await recordDocument({ companyId: a.header.companyId, path: stored.path, filename, sizeBytes: bytes.byteLength, uploadedBy: a.header.preparedBy });
    if (!recorded.ok) return recorded;
    const noted = await annotateApproval({ ...ref, metadata: { signedCopyDocumentId: recorded.id, signedCopyPath: stored.path } });
    if (!noted.ok) return noted;
  }

  if (origin) {
    const { error } = await companyOs.from("deals").update({ contract_url: `${origin}/portal/agreements/${a.id}` }).eq("id", a.header.dealId);
    if (error) console.error(`[crm/agreements] deal ${a.header.dealId} contract_url:`, error.message);
    else await recordAudit({ table: "deals", recordId: a.header.dealId, operation: "update", actor: "agreements", newData: { contract_url: `${origin}/portal/agreements/${a.id}` } });
  }

  if (!a.client.emailedAt && origin) {
    const subject = `${a.header.title}: signed by both parties`;
    await sendTransactionalEmail({
      to: a.client.email,
      subject,
      html: agreementEmail({
        lines: [`Hi ${a.header.signer.name},`, `Thank you. ${a.header.title} is now signed by you and by Edge8. Your signed copy is in the Client Portal.`],
        button: { label: "Open the signed agreement", href: `${origin}/portal/agreements/${a.id}` },
      }),
      idempotencyKey: `agreement-signed-${a.id}-client`,
      logMeta: { agreement_id: a.id, deal_id: a.header.dealId },
    });
    // Edge8's signer is told with a link to the deal, and a link goes only to
    // someone who may open that page (AC.15, ADR 0013). The signature is
    // already recorded, so a lookup that fails sends this one email to no one
    // rather than failing the signing.
    const dealPath = `/admin/revenue/deals/${a.header.dealId}`;
    const signerMayOpenDeal = a.header.edge8
      ? await recipientMayOpenByEmail(a.header.edge8.email)
          .then((may) => may(dealPath))
          .catch((err) => {
            console.error("[crm/agreements] signer access:", err instanceof Error ? err.message : err);
            return false;
          })
      : false;
    if (a.header.edge8 && signerMayOpenDeal) {
      await sendTransactionalEmail({
        to: a.header.edge8.email,
        subject: `${a.header.companyName ?? "The client"} signed ${a.header.title}`,
        html: agreementEmail({
          lines: [`${a.client.name} (${a.client.title}) signed ${a.header.title} on ${new Date(a.client.signedAt).toUTCString()}.`],
          button: { label: "Open the deal", href: `${origin}${dealPath}` },
        }),
        idempotencyKey: `agreement-signed-${a.id}-edge8`,
        logMeta: { agreement_id: a.id, deal_id: a.header.dealId },
      });
    }
    await annotateApproval({ ...ref, metadata: { emailedAt: new Date().toISOString() } });
  }
  return { ok: true };
}

/** Records what happened when the agreement's invoice was raised. */
export async function recordAgreementInvoice(agreementId: string, invoice: AgreementInvoice): Promise<{ ok: true } | { ok: false; error: string }> {
  return annotateApproval({ subjectType: AGREEMENT_CLIENT, subjectId: agreementId, metadata: { invoice } });
}

/** Whether the agreement still needs its invoice raised: signed, and no invoice on record. */
export function needsInvoice(a: Agreement): boolean {
  return a.status === "signed" && !!a.client && !(a.client.invoice && "qboId" in a.client.invoice);
}

/** Withdraws an agreement not yet signed by the client. */
export async function voidAgreement(input: { agreementId: string; by: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await getAgreement(input.agreementId);
  if (!a) return { ok: false, error: "Agreement not found." };
  if (a.status === "signed") return { ok: false, error: "A signed agreement cannot be voided here." };
  if (a.status === "void") return { ok: true };
  const cancelledBy = await personIdForEmailOrNull(input.by, "crm/agreements");
  const subjectType = a.status === "sent" ? AGREEMENT_CLIENT : AGREEMENT_EDGE8;
  const r = await cancelApproval({ subjectType, subjectId: a.id, cancelledBy }, input.by);
  if (!r.ok) return r;
  await recordAudit({ table: "deals", recordId: a.header.dealId, operation: "update", actor: input.by, context: { action: "agreement_voided", agreementId: a.id } });
  return { ok: true };
}

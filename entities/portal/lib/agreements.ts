// Agreements in the client portal. The agreements and their signatures are
// crm's (entities/crm/lib/agreements.ts, beside the deal they close); this
// module applies the portal actor's rules to them and runs what follows a
// client's signature: the signed copy, the emails and the invoice. The invoice
// is raised here rather than in crm because invoicing is company-os's and
// portal already sits above both, so crm's requirements stay as they were.

import type { PortalActor } from "@/kernel/identity/portal-auth";
import { notifyOps } from "@/kernel/messaging/lark";
import { formatCents } from "@/kernel/ui/format";
import {
  completeSignedAgreement,
  getAgreement,
  listAgreementsToSignFor,
  mayClientSee,
  needsInvoice,
  recordAgreementInvoice,
  type Agreement,
} from "@/entities/crm";
import { invoiceCompanyForHours } from "@/entities/company-os";

export type { Agreement } from "@/entities/crm";

// The portal home's "Agreement to sign" card. A failed read costs the card,
// not the whole home page: the signer also has the emailed link, and the
// agreement page itself reads with no fallback.
export async function listAgreementsToSignForActor(actor: PortalActor): Promise<Agreement[]> {
  try {
    return await listAgreementsToSignFor(actor);
  } catch (e) {
    console.error("[portal/agreements] agreements to sign:", e instanceof Error ? e.message : e);
    return [];
  }
}

/**
 * The agreement this portal account may open, or null: not theirs, not sent
 * yet, or an admin viewing the portal as the client. The page answers all of
 * those with a 404, so it never says an agreement exists to someone it is not
 * addressed to.
 */
export async function getAgreementForActor(actor: PortalActor, agreementId: string): Promise<Agreement | null> {
  if (actor.impersonation) return null;
  const a = await getAgreement(agreementId);
  return a && mayClientSee(actor, a) ? a : null;
}

/**
 * Raises the agreement's invoice once. A company with no QuickBooks customer,
 * or one billed in another currency, is a setup gap a human closes, and a
 * QuickBooks failure is worth a retry; either way the signature stands, the
 * reason is stored on the agreement for the deal page's Retry button, and ops
 * is told.
 */
export async function invoiceSignedAgreement(agreementId: string): Promise<{ ok: true; invoiced: boolean } | { ok: false; error: string }> {
  const a = await getAgreement(agreementId);
  if (!a) return { ok: false, error: "Agreement not found." };
  if (!needsInvoice(a)) return { ok: true, invoiced: false };
  const company = a.header.companyName ?? "The client";

  const result = await invoiceCompanyForHours({
    companyId: a.header.companyId,
    hours: 1,
    rateCents: a.header.fee.cents,
    description: a.header.fee.description,
    memo: `Agreement ${a.header.title} (${a.id})`,
    itemName: "Agreement",
    expectCurrency: a.header.fee.currency,
  });
  if (!result.ok) {
    await recordAgreementInvoice(a.id, { error: result.reason, at: new Date().toISOString() });
    await notifyOps(`⚠️ ${company} signed ${a.header.title}, invoice NOT sent: ${result.reason}`);
    return { ok: false, error: result.reason };
  }
  const inv = result.invoice;
  const recorded = await recordAgreementInvoice(a.id, {
    qboId: inv.id,
    docNumber: inv.docNumber,
    ledgerId: result.ledgerId,
    amountCents: inv.totalCents,
    currency: inv.currency,
    emailed: result.emailed,
  });
  if (!recorded.ok) console.error(`[portal/agreements] invoice ${inv.id} raised but not recorded on ${a.id}:`, recorded.error);
  await notifyOps(
    `${company} signed ${a.header.title}; invoice ${inv.docNumber ?? inv.id} ${formatCents(inv.totalCents, inv.currency)} ${result.emailed ? "sent" : "raised (QuickBooks did not email it, resend from QuickBooks)"}`,
  );
  return { ok: true, invoiced: true };
}

/**
 * Everything after the client's signature. Never throws and never fails the
 * signature: the client has signed whatever happens here, and what did not
 * happen is logged and told to ops for a human to finish.
 */
export async function afterClientSigned(agreementId: string, origin: string): Promise<void> {
  try {
    const done = await completeSignedAgreement(agreementId, origin);
    if (!done.ok) {
      console.error(`[portal/agreements] completing ${agreementId}:`, done.error);
      await notifyOps(`⚠️ Agreement ${agreementId} was signed, but the signed copy or emails failed: ${done.error}`);
    }
  } catch (e) {
    console.error(`[portal/agreements] completing ${agreementId} threw:`, e);
  }
  try {
    await invoiceSignedAgreement(agreementId);
  } catch (e) {
    console.error(`[portal/agreements] invoicing ${agreementId} threw:`, e);
    await notifyOps(`⚠️ Agreement ${agreementId} was signed, but invoicing threw. Retry from the deal page.`).catch(() => false);
  }
}

"use server";

import { headers } from "next/headers";
import { requirePermission } from "@/kernel/identity/access-request";
import { revalidateSurfaces } from "@/kernel/shell/surface";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import type { Result } from "@/kernel/data/result";
import { getAgreement } from "@/entities/crm/lib/agreements";
import {
  prepareAgreement,
  sendAgreement,
  signAgreementForEdge8,
  voidAgreement,
  type SignEvidence,
} from "@/entities/crm/lib/agreement-signing";
import { invoiceSignedAgreement } from "@/entities/portal";

// The deal page's agreement card (E-signature). Only a Super Admin prepares an
// agreement, signs it for Edge8 and sends it: the signature binds the company.

async function evidence(): Promise<SignEvidence> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  return { ip, userAgent: h.get("user-agent") };
}

function refresh(dealId: string) {
  revalidateSurfaces(`/revenue/deals/${dealId}`);
  revalidateSurfaces("/revenue/deals");
}

export async function prepareAgreementAction(input: {
  dealId: string;
  markdown: string;
  filename: string;
  title: string;
  signer: { name: string; title: string; email: string };
  fee: { amount: number; currency: string; description: string };
}): Promise<{ ok: true; warnings: string[] } | { ok: false; error: string }> {
  const { user: admin } = await requirePermission("crm.agreements");
  const r = await prepareAgreement({ ...input, preparedBy: admin.email });
  if (!r.ok) return r;
  refresh(input.dealId);
  return { ok: true, warnings: r.warnings };
}

export async function signForEdge8Action(input: { agreementId: string; name: string; title: string }): Promise<Result> {
  const { user: admin } = await requirePermission("crm.agreements");
  const r = await signAgreementForEdge8({
    agreementId: input.agreementId,
    signer: { name: input.name, title: input.title, email: admin.email },
    evidence: await evidence(),
  });
  if (!r.ok) return r;
  const a = await getAgreement(input.agreementId).catch(() => null);
  if (a) refresh(a.header.dealId);
  return { ok: true };
}

export async function sendAgreementAction(agreementId: string): Promise<{ ok: true; emailed: boolean } | { ok: false; error: string }> {
  const { user: admin } = await requirePermission("crm.agreements");
  const r = await sendAgreement({ agreementId, sentBy: admin.email, origin: await getSiteOrigin() });
  if (!r.ok) return r;
  const a = await getAgreement(agreementId).catch(() => null);
  if (a) refresh(a.header.dealId);
  return r;
}

export async function voidAgreementAction(agreementId: string): Promise<Result> {
  const { user: admin } = await requirePermission("crm.agreements");
  const r = await voidAgreement({ agreementId, by: admin.email });
  if (!r.ok) return r;
  const a = await getAgreement(agreementId).catch(() => null);
  if (a) refresh(a.header.dealId);
  return { ok: true };
}

export async function retryInvoiceAction(agreementId: string): Promise<Result> {
  await requirePermission("crm.agreements");
  const r = await invoiceSignedAgreement(agreementId);
  const a = await getAgreement(agreementId).catch(() => null);
  if (a) refresh(a.header.dealId);
  if (!r.ok) return r;
  if (!r.invoiced) return { ok: false, error: "This agreement already has its invoice, or is not signed yet." };
  return { ok: true };
}

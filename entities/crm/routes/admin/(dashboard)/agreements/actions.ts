"use server";

import { headers } from "next/headers";
import { requirePermission } from "@/kernel/identity/access-request";
import { revalidateSurfaces } from "@/kernel/shell/surface";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import type { Result } from "@/kernel/data/result";
import { getAgreement, type Agreement } from "@/entities/crm/lib/agreements";
import { prepareAgreement, type PrepareAgreementInput } from "@/entities/crm/lib/agreement-prepare";
import { sendAgreement, signAgreementForEdge8, voidAgreement, type SignEvidence } from "@/entities/crm/lib/agreement-signing";
import { invoiceSignedAgreement } from "@/entities/portal";

// The agreement cards on a deal and on Admin → Agreements (E-signature). Only
// a Super Admin prepares an agreement, signs it for Edge8 and sends it: the
// signature binds the company.

async function evidence(): Promise<SignEvidence> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  return { ip, userAgent: h.get("user-agent") };
}

function refresh(dealId: string | null) {
  revalidateSurfaces("/agreements");
  if (!dealId) return;
  revalidateSurfaces(`/revenue/deals/${dealId}`);
  revalidateSurfaces("/revenue/deals");
}

async function refreshFor(agreementId: string) {
  const a: Agreement | null = await getAgreement(agreementId).catch(() => null);
  refresh(a?.header.dealId ?? null);
}

// The input without who prepared it: that is the signed-in admin, never the form.
type PrepareFields = PrepareAgreementInput extends infer T ? (T extends unknown ? Omit<T, "preparedBy"> : never) : never;

export async function prepareAgreementAction(input: PrepareFields): Promise<{ ok: true; warnings: string[] } | { ok: false; error: string }> {
  const { user: admin } = await requirePermission("crm.agreements");
  const r = await prepareAgreement({ ...input, preparedBy: admin.email });
  if (!r.ok) return r;
  refresh(input.type === "client" ? input.dealId : null);
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
  await refreshFor(input.agreementId);
  return { ok: true };
}

export async function sendAgreementAction(agreementId: string): Promise<{ ok: true; emailed: boolean } | { ok: false; error: string }> {
  const { user: admin } = await requirePermission("crm.agreements");
  const r = await sendAgreement({ agreementId, sentBy: admin.email, origin: await getSiteOrigin() });
  if (!r.ok) return r;
  await refreshFor(agreementId);
  return r;
}

export async function voidAgreementAction(agreementId: string): Promise<Result> {
  const { user: admin } = await requirePermission("crm.agreements");
  const r = await voidAgreement({ agreementId, by: admin.email });
  if (!r.ok) return r;
  await refreshFor(agreementId);
  return { ok: true };
}

export async function retryInvoiceAction(agreementId: string): Promise<Result> {
  await requirePermission("crm.agreements");
  const r = await invoiceSignedAgreement(agreementId);
  await refreshFor(agreementId);
  if (!r.ok) return r;
  if (!r.invoiced) return { ok: false, error: "This agreement already has its invoice, or is not signed yet." };
  return { ok: true };
}

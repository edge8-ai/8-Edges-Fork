"use server";

import { headers } from "next/headers";
import { requirePortalPermission } from "@/kernel/identity/access-request";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import type { Result } from "@/kernel/data/result";
import { signAgreementAsClient } from "@/entities/crm";
import { afterClientSigned } from "@/entities/portal/lib/agreements";

// The client signs an agreement (E-signature). Only the named signer's own
// portal account can, never an admin viewing the portal as the client; crm's
// signAgreementAsClient holds those rules. Once the signature is recorded the
// signed copy, the emails and the invoice follow; afterClientSigned never
// throws, so the client never sees an error from a step after their signature.
export async function signAgreementAction(input: {
  agreementId: string;
  typedName: string;
  title: string;
  consent: boolean;
  sha256Shown: string;
}): Promise<Result> {
  const actor = await requirePortalPermission("surface.portal");
  const h = await headers();
  const r = await signAgreementAsClient({
    agreementId: input.agreementId,
    actor,
    typedName: input.typedName,
    title: input.title,
    consent: input.consent,
    sha256Shown: input.sha256Shown,
    evidence: {
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null,
      userAgent: h.get("user-agent"),
    },
  });
  if (!r.ok) return r;
  await afterClientSigned(input.agreementId, await getSiteOrigin());
  return { ok: true };
}

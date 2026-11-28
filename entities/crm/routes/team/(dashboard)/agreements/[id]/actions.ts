"use server";

import { headers } from "next/headers";
import { requirePermission } from "@/kernel/identity/access-request";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import type { Result } from "@/kernel/data/result";
import { afterTeamMemberSigned, signAgreementAsTeamMember } from "@/entities/crm/lib/agreement-signing";

// An employee or contractor signs their own agreement (E-signature, AG.1).
// Only the named signer's own login can, never an admin viewing the Team
// pages as them (requirePermission already refuses a write while assuming,
// and the signing step refuses again); signAgreementAsTeamMember holds the
// rest. Once the signature is recorded the signed copy and the emails
// follow; afterTeamMemberSigned never throws, so the signer never sees an
// error from a step after their signature.
export async function signTeamAgreementAction(input: {
  agreementId: string;
  typedName: string;
  title: string;
  consent: boolean;
  sha256Shown: string;
}): Promise<Result> {
  const access = await requirePermission("surface.team");
  const h = await headers();
  const r = await signAgreementAsTeamMember({
    agreementId: input.agreementId,
    actor: { personId: access.personId, email: access.user.email, authUserId: access.user.id, impersonating: access.impersonation !== null },
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
  await afterTeamMemberSigned(input.agreementId, await getSiteOrigin());
  return { ok: true };
}

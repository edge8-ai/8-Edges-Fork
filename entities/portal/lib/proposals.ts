// Proposals Edge8 has written for the actor's companies, for the portal home.
// The read is crm's own (deals is its table); this wrapper only applies
// the portal actor's companyScope.

import type { PortalActor } from "@/kernel/identity/portal-auth";
import { listProposalsForCompanies, type CompanyProposal } from "@/entities/crm";

export type { CompanyProposal } from "@/entities/crm";

export async function getProposalsForActor(actor: PortalActor): Promise<CompanyProposal[]> {
  return listProposalsForCompanies(actor.companyScope);
}

// Proposals written for an assigned client, the same list the client sees on
// their portal home. Kept out of clients.ts only to stay under that file's
// size ceiling; the authorization rule is identical: the company must be in the
// actor's active assignment set, resolved server-side.

import type { TeamActor } from "@/kernel/identity/team-auth";
import { listProposalsForCompanies, type CompanyProposal } from "@/entities/crm";
import { getActorClientCompanies } from "./hub-clients";

export async function getClientProposalsForActor(
  actor: TeamActor,
  companyId: string,
): Promise<CompanyProposal[] | null> {
  const companies = await getActorClientCompanies(actor);
  if (!companies.some((c) => c.id === companyId)) return null;
  return listProposalsForCompanies([companyId]);
}

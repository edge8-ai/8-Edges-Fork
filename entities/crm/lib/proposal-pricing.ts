// Fork overlay stub: a fork has no proposal reference of its own until it
// writes one, so the proposal chain stops at its gather step saying so, rather
// than drafting against prices that are not the deployment's. Replaces
// entities/crm/lib/proposal-pricing.ts in the sync; keep the types identical.

export type PriceBand = {
  key: string;
  label: string;
  currency: string;
  minCents: number;
  maxCents: number;
  note: string;
};

export type ProposalHouse = {
  brandName: string;
  eyebrow: string;
  preparedBy: string;
  siteName: string;
  ogImageUrl: string;
  defaultCurrency: string;
  ownDomains: string[];
  bands: PriceBand[];
  productNames: { name: string; heard: string[] }[];
  standingTerms: string[];
};

export const PROPOSAL_HOUSE: ProposalHouse | null = null;

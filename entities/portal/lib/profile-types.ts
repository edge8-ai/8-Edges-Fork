// Browser-safe half of the portal company profile: the size-band vocabulary
// and the row shapes the company form renders. Kept apart from profile.ts,
// which holds the reads and writes (and, through the company-os door, server
// modules a "use client" component must not bundle).
export const SIZE_BANDS = ["0-50", "51-250", "251-5000", "5000+"] as const;

export type CompanyProfile = {
  name: string;
  industry: string;
  sizeBand: string;
  country: string;
  websiteUrl: string;
  headOffice: string;
  generalEmail: string;
  registrationNumber: string; // metadata.abn
  billingAddress: string;
};

export type CompanyProfileView = CompanyProfile & {
  companyId: string;
  clientSince: string | null;
  clientTypes: string[];
};

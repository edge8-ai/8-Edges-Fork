// The deal card the pipeline board, the detail shelf and the revenue cockpit
// share, with the vocabularies the forms offer. Split out of DealsBoard.tsx
// (Q3, 2026-09-05) so the four components can live in their own files.

export type StageOption = { id: string; name: string };

// Extra input a stage move may require: a reason when landing on a lost stage,
// the final deal amount (in the deal's currency) when landing on a won one.
export type MoveOpts = { lostReason?: string; wonAmount?: number };

export type DealCard = {
  id: string;
  columnId: string;
  stageId: string | null;
  position: number;
  title: string | null;
  personId: string | null;
  contactName: string | null;
  companyName: string | null;
  amountCents: number | null;
  amountUsdCents: number | null;
  currency: string | null;
  probability: number | null;
  status: string | null;
  expectedClose: string | null;
  source: string | null;
  nextStep: string | null;
  nextStepDate: string | null;
  proposalUrl: string | null;
  contractUrl: string | null;
  handoffStatus: string;
  lostReason: string | null;
  archivedAt: string | null;
  updatedAt: string | null;
  referrerId: string | null;
  referrerName: string | null;
  referrerCompanyId: string | null;
  referrerCompanyName: string | null;
};

export const LOST_REASONS = [
  ["price", "Price"],
  ["competitor", "Chose competitor"],
  ["no_decision", "No decision"],
  ["bad_fit", "Bad fit"],
  ["bad_timing", "Bad timing"],
  ["ghosted", "Ghosted"],
  ["other", "Other"],
] as const;

export const REJECT_REASONS = [
  ["not_qualified", "Not qualified"],
  ["bad_fit", "Bad fit"],
  ["duplicate", "Duplicate"],
  ["bad_timing", "Bad timing"],
  ["other", "Other"],
] as const;

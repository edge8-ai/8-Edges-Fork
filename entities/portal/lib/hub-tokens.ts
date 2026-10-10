// Company-grain human-token accounting.
//
// This file is an overlay stub for 8-Edges-Fork. It only neutralises upstream
// while it sits at the SAME repo-relative path as the real module — today
// entities/portal/lib/hub-tokens.ts. Move that module and this copy moves with
// it, or the fork gets the upstream one and this stub lands where nothing
// imports it.
//
// Fork note: upstream prices delivery against the Human Token Tracker (the
// `htt` schema), which is internal and never ships. The portal home, the
// requests page and the admin company hub DO ship and read these figures, so
// the module has to exist for the fork to build — and each of those screens
// renders nothing on a zero balance.
//
// Every type below is a verbatim copy of upstream's. That duplication is the
// price of the stub and the thing most likely to rot: a field added upstream and
// not added here fails the FORK's typecheck, not this repo's, so the fork build
// in CI is what catches it. The values are all empty; no query is made against a
// schema the fork's database does not have.

export const CLAUDE_TOKENS_PER_VALUE_TOKEN = 100_000;

export const leverageOf = (_aiTokens: number, _humanHours: number): number | null => null;

export const humanHoursOf = (_row: { hours: number | null; measured_hours?: number | null }): number => 0;

export function formatLeverage(_leverage: number | null): string {
  return "—";
}

export type TokenPurchase = {
  id: string;
  packs: number;
  tokens: number;
  amountCents: number;
  status: "pending" | "paid" | "expired";
  createdAt: string;
  paidAt: string | null;
};

export type TokenBalance = {
  balanceTokens: number;
  pendingTokens: number;
  purchases: TokenPurchase[];
};

export type ProgramUsage = {
  programId: string;
  name: string;
  deliveredHours: number;
  aiTokens: number;
  leverage: number | null;
};

export type TokenUsage = {
  purchasedTokens: number;
  allocatedTokens: number;
  boughtTokens: number;
  pendingTokens: number;
  plannedTokens: number;
  deliveredHours: number;
  addedHours: number;
  humanHours: number;
  balanceTokens: number;
  aiTokens: number;
  leverage: number | null;
  programs: ProgramUsage[];
  purchases: TokenPurchase[];
};

export const EMPTY_USAGE: TokenUsage = {
  purchasedTokens: 0,
  allocatedTokens: 0,
  boughtTokens: 0,
  pendingTokens: 0,
  plannedTokens: 0,
  deliveredHours: 0,
  addedHours: 0,
  humanHours: 0,
  balanceTokens: 0,
  aiTokens: 0,
  leverage: null,
  programs: [],
  purchases: [],
};

export const EMPTY_BALANCE: TokenBalance = {
  balanceTokens: 0,
  pendingTokens: 0,
  purchases: [],
};

export type DeliveryRepo = {
  id: string;
  name: string;
  github_repo: string | null;
  ai_program_id: string | null;
  live_url: string | null;
  last_synced_at: string | null;
};

export type HourRow = { repo_id: string | null; hours: number; measured_hours: number | null };
export type DeliveredAdditionRow = { hours: number };
export type AiTokenRow = { repo_id: string | null; amount: number };

export type DeliveryProgram = { id: string; name: string };

export type DeliveryRaw = {
  repos: DeliveryRepo[];
  programs: DeliveryProgram[];
  hourRows: HourRow[];
  aiRows: AiTokenRow[];
  additions: DeliveredAdditionRow[];
};

export function withLiveProgramsOnly<T extends { ai_program_id: string | null }>(
  _repos: T[],
  _live: Set<string>,
): T[] {
  return [];
}

export async function fetchDeliveryRaw(_companyIds: string[]): Promise<DeliveryRaw> {
  return { repos: [], hourRows: [], aiRows: [], additions: [], programs: [] };
}

export async function getDeliveredHoursSince(_companyIds: string[], _sinceDay: string): Promise<number> {
  return 0;
}

export async function getTokenBalanceForCompanies(_companyIds: string[]): Promise<TokenBalance> {
  return EMPTY_BALANCE;
}

export async function getAllocatedTokensForCompanies(_companyIds: string[]): Promise<number> {
  return 0;
}

export function computeTokenUsage(_args: unknown): TokenUsage {
  return EMPTY_USAGE;
}

export async function getTokenUsageForCompanies(_companyIds: string[]): Promise<TokenUsage> {
  return EMPTY_USAGE;
}

// The contract of the humanTokens slot: what a page outside the Human Token
// Tracker may know of a company's human-token accounting, and the shape of the
// reads htt provides through the slot.
//
// Human Tokens are Edge8's overlay (Khoa, 2026-10-29, ADR 0031 "Decided"), and
// htt, which keeps them, is internal: the public fork has no htt. So the
// accounting lives in htt (entities/htt/lib/hub-tokens.ts), a page takes it
// through htt's slot (entities/htt/slots.ts), and in a deployment without htt
// the slot is null and the page shows no tokens. The types and the three pure
// helpers below stay in the kernel because ADR 0026 keeps an internal
// provider's slot type here: a portable page must still compile where htt is
// absent. Before ADR 0032 they lived in the portal, and the fork carried a
// hand-kept copy of every type to build.

// Claude tokens are counted in the millions; a "value token" normalizes them to
// a human-legible unit so leverage reads as a small multiple (AI value delivered
// per human hour) rather than a six-figure tokens-per-hour figure. One value
// token = 100,000 Claude/app tokens.
export const CLAUDE_TOKENS_PER_VALUE_TOKEN = 100_000;

// Leverage = value tokens per HUMAN hour; null when no human hours are recorded.
export const leverageOf = (aiTokens: number, humanHours: number): number | null =>
  humanHours > 0 ? aiTokens / CLAUDE_TOKENS_PER_VALUE_TOKEN / humanHours : null;

// The human part of a ledger row: the hours the person was hands-on, before any
// unattended-AI credit. A legacy or hand-entered row carries no measured figure,
// so it falls back to its billed hours — the best evidence that row has.
export const humanHoursOf = (row: { hours: number | null; measured_hours?: number | null }): number =>
  Number(row.measured_hours ?? row.hours ?? 0);

// The one display form for leverage: a one-decimal multiple with the × sign, or
// "n/a" when there is nothing to divide by. Never an em dash.
export function formatLeverage(leverage: number | null): string {
  return leverage == null ? "n/a" : `${leverage.toFixed(1)}×`;
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
  balanceTokens: number; // sum of paid tokens
  pendingTokens: number; // checkout started, webhook not landed
  purchases: TokenPurchase[];
};

/** No tokens bought: what a page shows without htt, or for a person with no company. */
export const EMPTY_BALANCE: TokenBalance = { balanceTokens: 0, pendingTokens: 0, purchases: [] };

export type ProgramUsage = {
  programId: string;
  name: string; // the program's name; its repos are summed into it (X.1)
  deliveredHours: number;
  aiTokens: number;
  leverage: number | null; // value tokens per delivered hour (multiple); null when no hours
};

export type TokenUsage = {
  purchasedTokens: number; // paid Stripe purchases
  allocatedTokens: number; // current manual allocation (latest seq per company)
  boughtTokens: number; // purchased + allocated
  pendingTokens: number;
  plannedTokens: number; // SUM(client_backlog_items.token_high), active items
  deliveredHours: number; // SUM(htt.man_hour_entries.hours), status <> excluded, plus addedHours
  addedHours: number; // SUM(htt.delivered_additions.hours): work that never ran through Claude, added by hand
  humanHours: number; // SUM(measured_hours) — hands-on only, the leverage denominator
  balanceTokens: number; // bought - delivered
  aiTokens: number; // SUM(htt.token_entries.amount) for kind claude/app
  leverage: number | null; // value tokens per delivered hour (multiple); null when no hours
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

// The repo select is the superset both consumers need: token usage reads
// id/name, the program layer additionally reads github_repo, ai_program_id,
// live_url and last_synced_at. One fetch serves both. A program may own many
// repos (X.1), so every consumer groups these by ai_program_id.
export type DeliveryRepo = {
  id: string;
  name: string;
  github_repo: string | null;
  ai_program_id: string | null;
  live_url: string | null;
  last_synced_at: string | null;
};

export type HourRow = { repo_id: string | null; hours: number; measured_hours: number | null };
// htt.delivered_additions: hours added by hand for work that never ran through Claude.
export type DeliveredAdditionRow = { hours: number };
export type AiTokenRow = { repo_id: string | null; amount: number };

// A live (not archived) AI Program, by the name its rows are listed under.
export type DeliveryProgram = { id: string; name: string };

export type DeliveryRaw = {
  repos: DeliveryRepo[];
  programs: DeliveryProgram[]; // the live programs the repos can bill through
  hourRows: HourRow[]; // man_hour_entries, status <> 'excluded'
  aiRows: AiTokenRow[]; // token_entries, kind claude/app
  additions: DeliveredAdditionRow[]; // delivered_additions, company grain
};

/** No delivery: what a program view counts from without htt. */
export const EMPTY_DELIVERY: DeliveryRaw = { repos: [], programs: [], hourRows: [], aiRows: [], additions: [] };

/**
 * What htt's humanTokens slot gives a page, every read scoped to the company
 * ids the caller passes (and has already authorised): the raw delivery rows,
 * the hours delivered since a day, the bought tokens, the manual allocation,
 * the whole usage rollup, and the pure rollup over pieces already fetched.
 * Null in a deployment without htt.
 */
export type HumanTokens = {
  deliveryRaw: (companyIds: string[]) => Promise<DeliveryRaw>;
  deliveredHoursSince: (companyIds: string[], sinceDay: string) => Promise<number>;
  balance: (companyIds: string[]) => Promise<TokenBalance>;
  allocated: (companyIds: string[]) => Promise<number>;
  usage: (companyIds: string[]) => Promise<TokenUsage>;
  computeUsage: (args: { balance: TokenBalance; allocatedTokens: number; plannedTokens: number; delivery: DeliveryRaw }) => TokenUsage;
};
export type HumanTokensSlot = HumanTokens | null;

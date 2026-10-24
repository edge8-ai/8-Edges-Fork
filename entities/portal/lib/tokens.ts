// Human-token packs.
//
// This file is an overlay stub for 8-Edges-Fork, and only works while it sits at
// the SAME repo-relative path as the real module — today
// entities/portal/lib/tokens.ts.
//
// Fork note: upstream sells pre-bought packs of skilled hours through Stripe and
// draws them down against tracker-measured delivery. That is upstream's
// commercial model, not something a fork inherits, so the purchase route and the
// pricing are excluded outright. These two readers survive because the portal
// home and the requests page call them, and both render nothing on a zero
// balance.
import type { PortalActor } from "@/kernel/identity/portal-auth";
import { EMPTY_BALANCE, EMPTY_USAGE, type TokenBalance, type TokenUsage } from "@/entities/portal/lib/hub-tokens";

export type { TokenBalance, TokenUsage } from "@/entities/portal/lib/hub-tokens";

// Upstream also exports the pack size and price. They are the commercial model,
// not the shape callers need, so they are absent here — anything that priced a
// pack would fail to compile in the fork rather than quote a number.
export async function getTokenBalance(_actor: PortalActor): Promise<TokenBalance> {
  return EMPTY_BALANCE;
}

export async function getTokenUsage(_actor: PortalActor): Promise<TokenUsage> {
  return EMPTY_USAGE;
}

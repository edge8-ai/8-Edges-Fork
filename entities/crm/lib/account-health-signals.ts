import { isCollectible } from "@/entities/finance";
import { businessDate, diffDays } from "@/kernel/config/dates";
import type { HealthSignals } from "./account-health-score";

// The four account-health signals, computed from rows the routine has already
// read (S.6). Pure: every question about "which rows count" is answered here,
// where a test can reach it, and account-health.ts only fetches.
//
// Days are counted on the business calendar (Saigon), the same one every other
// date on the Revenue screens uses, so "met today" means today where the team
// works and not today in UTC.

export type MeetingFact = { company_id: string | null; started_at: string | null };
export type InvoiceFact = { company_id: string | null; status: string | null; balance_cents: number | null; due_date: string | null };
export type BacklogFact = { company_id: string; updated_at: string; archived_at: string | null };
export type PortalMemberFact = { company_id: string | null; auth_user_id: string | null };

/** The latest meeting start per company, as a timestamp. */
export function latestMeetingByCompany(rows: MeetingFact[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of rows) {
    if (!r.company_id || !r.started_at) continue;
    const seen = out.get(r.company_id);
    if (!seen || Date.parse(r.started_at) > Date.parse(seen)) out.set(r.company_id, r.started_at);
  }
  return out;
}

/**
 * Overdue invoices per company: due before today and still collectible.
 *
 * "Still owed" is finance's question and finance's words (isCollectible: not
 * voided, a positive balance), never a second definition here. The balance is
 * passed unconverted because only its sign matters to a count, and the sign of
 * an amount does not change with its currency.
 */
export function overdueByCompany(rows: InvoiceFact[], today: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (!r.company_id || !r.due_date || r.due_date >= today) continue;
    if (!isCollectible(r, r.balance_cents ?? 0)) continue;
    out.set(r.company_id, (out.get(r.company_id) ?? 0) + 1);
  }
  return out;
}

/**
 * Which companies have a roadmap at all, and how many of its items moved since
 * `sinceIso`. An item archived inside the window is a move too — taking an
 * item off the roadmap is roadmap work — but only a live item makes a roadmap.
 */
export function roadmapByCompany(rows: BacklogFact[], sinceIso: string): { hasRoadmap: Set<string>; moves: Map<string, number> } {
  const hasRoadmap = new Set<string>();
  const moves = new Map<string, number>();
  const since = Date.parse(sinceIso);
  for (const r of rows) {
    if (!r.archived_at) hasRoadmap.add(r.company_id);
    if (Date.parse(r.updated_at) >= since) moves.set(r.company_id, (moves.get(r.company_id) ?? 0) + 1);
  }
  return { hasRoadmap, moves };
}

/** The auth accounts of each company's active portal members. */
export function portalAccountsByCompany(rows: PortalMemberFact[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.company_id || !r.auth_user_id) continue;
    out.set(r.company_id, [...(out.get(r.company_id) ?? []), r.auth_user_id]);
  }
  return out;
}

export type HealthFacts = {
  lastMeeting: Map<string, string>;
  overdue: Map<string, number>;
  roadmap: { hasRoadmap: Set<string>; moves: Map<string, number> };
  portalAccounts: Map<string, string[]>;
  lastSignIns: Map<string, string | null>;
};

/** One company's signals, from the facts gathered for every account. */
export function signalsFor(companyId: string, facts: HealthFacts, today: string): HealthSignals {
  const met = facts.lastMeeting.get(companyId);
  const accounts = facts.portalAccounts.get(companyId) ?? [];
  const signIns = accounts
    .map((id) => facts.lastSignIns.get(id) ?? null)
    .filter((at): at is string => at !== null)
    .sort((a, b) => Date.parse(b) - Date.parse(a));
  return {
    daysSinceMeeting: met ? Math.max(0, diffDays(businessDate(met), today)) : null,
    neverMet: !met,
    overdueInvoices: facts.overdue.get(companyId) ?? 0,
    roadmapMoves30d: facts.roadmap.hasRoadmap.has(companyId) ? facts.roadmap.moves.get(companyId) ?? 0 : null,
    portalSignInDays: signIns[0] ? Math.max(0, diffDays(businessDate(signIns[0]), today)) : null,
    // Members with accounts, none of whom has signed in. A company with no
    // portal members at all is not "never signed in"; it has no portal to use.
    portalNeverSignedIn: accounts.length > 0 && signIns.length === 0,
  };
}

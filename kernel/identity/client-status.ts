import { saigonToday } from "@/kernel/config/dates";

// Whether a company is a client comes from its two client dates, not from
// lifecycle_stage: the stage is raise-only, so a company that bought once stays
// `customer` forever. Dates are calendar days ("2026-09-16") compared as strings
// against the Saigon calendar date, so a relationship ending today still reads
// as active today.
//
// Two questions use this. "Is it a client now" (the Clients list, the client
// count, portal "view as") wants `current`. "Has it been a client" (Client Hubs,
// the company page's Hub view, the Workboard and roadmap pickers) wants anything
// but `none`, because a former client keeps its hub and portal as they were.

export type ClientTerm =
  | { state: "unset" }
  | { state: "upcoming"; daysUntilStart: number }
  | { state: "active"; daysLeft: number | null }
  | { state: "ended"; daysSinceEnd: number };

const DAY_MS = 86_400_000;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export function clientTerm(start: string | null, end: string | null, today: string): ClientTerm {
  if (!start && !end) return { state: "unset" };
  if (start && start > today) return { state: "upcoming", daysUntilStart: daysBetween(today, start) };
  if (end && end < today) return { state: "ended", daysSinceEnd: daysBetween(end, today) };
  return { state: "active", daysLeft: end ? daysBetween(today, end) : null };
}

export type ClientDates = { client_start_date: string | null; client_end_date: string | null };
export type ClientStatus = "current" | "upcoming" | "former" | "none";

export function clientStatus(c: ClientDates, today: string = saigonToday()): ClientStatus {
  const state = clientTerm(c.client_start_date, c.client_end_date, today).state;
  return state === "active" ? "current" : state === "ended" ? "former" : state === "upcoming" ? "upcoming" : "none";
}

export const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = {
  current: "Client",
  upcoming: "Upcoming client",
  former: "Former client",
  none: "Not a client",
};

// The same rules as PostgREST OR groups, for list queries; each group is one
// `.or(...)`, and successive groups are ANDed.
export function currentClientOrFilters(today: string = saigonToday()): string[] {
  return [
    "client_start_date.not.is.null,client_end_date.not.is.null",
    `client_start_date.is.null,client_start_date.lte.${today}`,
    `client_end_date.is.null,client_end_date.gte.${today}`,
  ];
}

export const HAS_CLIENT_DATES_FILTER = "client_start_date.not.is.null,client_end_date.not.is.null";

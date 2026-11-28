// Client Hubs as a picture of every client (AH.6). The page used to be a
// table of names, industries and priorities, which answers "who are our
// clients" and not "how is each one doing", the reason to open it. This module
// turns what other entities already store (each client board's cards and
// blockers, the last meeting, unpaid invoices past due) into one card per
// client: a status, the reasons for it, and the one next thing to do. It is
// plain values in and out, so the rules are tested without a database
// (client-portfolio.test.ts).
//
// The status is worked out, never set by hand, and red is kept for a real
// problem (AH.7.2). Until then any late card, any blocker or any unpaid
// invoice made a client "Needs you", so half the clients were red on a normal
// day and the one that mattered could not be told apart. Blockers are normal,
// and a late date on a card only the team sees is housekeeping, which the
// Monday nudge deals with. So:
// - Needs you: an invoice more than 90 days overdue, a blocker waiting on the
//   reader, or a card the client can see that is still late after its date
//   moved twice.
// - At risk: an invoice 31 to 90 days overdue, a card the client can see more
//   than a week late, a blocker open more than two weeks, or open work with no
//   meeting and no card moved in 30 days.
// - Quiet: no open work, and no meeting in the last QUIET_DAYS days.
// - On track: everything else.
// Nothing on a card is about a team member other than the reader: a
// blocker's text and holder are shown only when it waits on the reader, and
// an old blocker is shown by its card alone (client-hubs/page.test.tsx and
// boards' client-attention.test.ts).
import { diffDays } from "@/kernel/config/dates";

export const QUIET_DAYS = 30;
export const INVOICE_RISK_DAYS = 30;
export const INVOICE_NEEDS_DAYS = 90;
export const SLIPPED_MOVES = 2;

export type PortfolioStatus = "needs" | "risk" | "ok" | "quiet";
export type PortfolioBoard = {
  name: string;
  slug: string;
  open: number;
  /** Client-visible cards more than a week late, with how often each date has moved. */
  clientLate: { id: string; title: string; lateDays: number; dueMoves: number }[];
  oldBlockers: { cardTitle: string; days: number }[];
  lastMoveDays: number | null;
};
export type PortfolioInvoice = { id: string; docNumber: string | null; dueDate: string; balance: string };
export type PortfolioClientIn = {
  id: string;
  name: string;
  programs: number;
  boards: PortfolioBoard[];
  lastMet: string | null;
  overdueInvoices: PortfolioInvoice[];
  /** Open blockers on this client's boards that name the reader as the one to clear them. */
  blockersOnReader: { blockerId: string; cardTitle: string; text: string; boardSlug: string }[];
};
export type PortfolioReason = {
  level: "needs" | "risk";
  text: string;
  action: string;
  href: string;
  /** A blocker the reader can mark cleared from the card, as Revenue today closes a deal in place (RT.1). */
  clear?: { blockerId: string; boardSlug: string };
};
export type PortfolioCard = {
  id: string;
  name: string;
  href: string;
  sub: string;
  status: PortfolioStatus;
  open: number;
  /** Why the card is red or amber, the worst first; at most three. */
  reasons: PortfolioReason[];
  /** Plain facts under the reasons: the open work, the last meeting, money not yet a problem. */
  facts: string[];
  next: { label: string; href: string | null };
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const times = (n: number) => (n === 2 ? "twice" : `${n} times`);
const RANK: Record<PortfolioStatus, number> = { needs: 0, risk: 1, quiet: 2, ok: 3 };
const INVOICES = "/admin/revenue/invoices";
const MAX_REASONS = 3;

function reasonsFor(c: PortfolioClientIn, today: string, open: number, sinceMet: number | null): PortfolioReason[] {
  const out: PortfolioReason[] = [];
  const board = (slug: string) => `/admin/boards/${slug}`;
  const invoiceDays = (i: PortfolioInvoice) => diffDays(i.dueDate, today);
  const invoiceText = (i: PortfolioInvoice) => `Invoice ${i.docNumber ?? ""}, ${i.balance}, ${plural(invoiceDays(i), "day")} overdue`.replace("  ", " ");
  const chase = (i: PortfolioInvoice) => `Chase invoice ${i.docNumber ?? ""}`.trim();

  for (const i of c.overdueInvoices.filter((i) => invoiceDays(i) > INVOICE_NEEDS_DAYS)) out.push({ level: "needs", text: invoiceText(i), action: chase(i), href: INVOICES });
  for (const b of c.blockersOnReader) out.push({ level: "needs", text: `Blocker waiting on you: ${b.text} (on "${b.cardTitle}")`, action: `Clear the blocker on "${b.cardTitle}"`, href: board(b.boardSlug), clear: { blockerId: b.blockerId, boardSlug: b.boardSlug } });
  for (const b of c.boards)
    for (const k of b.clientLate.filter((k) => k.dueMoves >= SLIPPED_MOVES))
      out.push({ level: "needs", text: `"${k.title}" moved ${times(k.dueMoves)}, ${plural(k.lateDays, "day")} late`, action: `Open ${b.name}`, href: board(b.slug) });

  for (const i of c.overdueInvoices.filter((i) => invoiceDays(i) > INVOICE_RISK_DAYS && invoiceDays(i) <= INVOICE_NEEDS_DAYS)) out.push({ level: "risk", text: invoiceText(i), action: chase(i), href: INVOICES });
  for (const b of c.boards) {
    const late = b.clientLate.filter((k) => k.dueMoves < SLIPPED_MOVES);
    if (late.length === 1) out.push({ level: "risk", text: `"${late[0].title}" ${plural(late[0].lateDays, "day")} late`, action: `Open ${b.name}`, href: board(b.slug) });
    if (late.length > 1) out.push({ level: "risk", text: `${late.length} client cards more than a week late on ${b.name}`, action: `Open ${b.name}`, href: board(b.slug) });
    const oldest = b.oldBlockers[0];
    if (oldest) out.push({ level: "risk", text: `Blocker on "${oldest.cardTitle}" open ${plural(oldest.days, "day")}`, action: `Open ${b.name}`, href: board(b.slug) });
  }
  const moved = c.boards.map((b) => b.lastMoveDays).filter((d): d is number => d !== null);
  const sinceMoved = moved.length ? Math.min(...moved) : null;
  const silent = (sinceMet === null || sinceMet > QUIET_DAYS) && (sinceMoved === null || sinceMoved > QUIET_DAYS);
  if (open > 0 && silent) out.push({ level: "risk", text: `Open work, but no meeting and no card moved in ${QUIET_DAYS} days`, action: "Check in", href: `/admin/revenue/companies/${c.id}?from=client-hubs` });
  return out;
}

export function portfolioCard(c: PortfolioClientIn, today: string): PortfolioCard {
  const open = c.boards.reduce((n, b) => n + b.open, 0);
  const sinceMet = c.lastMet ? diffDays(c.lastMet.slice(0, 10), today) : null;
  const all = reasonsFor(c, today, open, sinceMet);
  const status: PortfolioStatus = all.some((r) => r.level === "needs") ? "needs" : all.length ? "risk" : open === 0 && (sinceMet === null || sinceMet > QUIET_DAYS) ? "quiet" : "ok";
  const hub = `/admin/revenue/companies/${c.id}?from=client-hubs`;

  // Money past due but not yet a problem is still worth a line, so nobody is
  // surprised when it turns amber.
  const youngInvoices = c.overdueInvoices.filter((i) => diffDays(i.dueDate, today) <= INVOICE_RISK_DAYS);
  const met = c.lastMet ? `last met ${sinceMet === 0 ? "today" : `${plural(sinceMet!, "day")} ago`}` : "no meeting on record";
  const facts = [
    youngInvoices.length ? `${plural(youngInvoices.length, "invoice")} just past due, ${youngInvoices[0].balance} on the oldest` : null,
    open > 0 ? `${plural(open, "open card")} · ${met}` : met[0].toUpperCase() + met.slice(1),
  ].filter((f): f is string => f !== null);

  const first = all[0];
  const next: PortfolioCard["next"] = first
    ? { label: first.action, href: first.href }
    : status === "quiet"
      ? { label: sinceMet === null ? "Check in: no meeting on record" : `Check in: no meeting in ${plural(sinceMet, "day")}`, href: hub }
      : { label: "Nothing waiting on you", href: null };

  return {
    id: c.id,
    name: c.name,
    href: hub,
    sub: [c.boards.length === 1 ? c.boards[0].name : c.boards.length > 1 ? plural(c.boards.length, "board") : null, c.programs > 0 ? plural(c.programs, "AI program") : null].filter(Boolean).join(" · ") || "No board yet",
    status,
    open,
    reasons: all.slice(0, MAX_REASONS),
    facts,
    next,
  };
}

/** The cards: needs you first, then at risk, quiet, on track; the most reasons first within each. */
export function portfolio(clients: PortfolioClientIn[], today: string): PortfolioCard[] {
  return clients
    .map((c) => portfolioCard(c, today))
    .sort((a, b) => RANK[a.status] - RANK[b.status] || b.reasons.length - a.reasons.length || a.name.localeCompare(b.name));
}

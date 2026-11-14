// Client Hubs as a picture of every client (AH.6). The page used to be a
// table of names, industries and priorities, which answers "who are our
// clients" and not "how is each one doing", the reason to open it. This module
// turns what other entities already store (each client board's open, late and
// blocked cards, the last meeting, unpaid invoices past due) into one card per
// client: a status, its work, and the one next thing to do. It is plain values
// in and out, so the rules are tested without a database (client-portfolio.test.ts).
//
// The status is worked out, never set by hand:
// - Needs you: an invoice past due, a late card, or a blocked card.
// - Quiet: no open work, and no meeting in the last QUIET_DAYS days.
// - On track: everything else.
// Nothing on a card is a figure about one person on the team.
import { diffDays } from "@/kernel/config/dates";

export const QUIET_DAYS = 30;

export type PortfolioStatus = "needs" | "ok" | "quiet";
export type PortfolioBoard = { name: string; slug: string; open: number; overdue: number; blocked: number; oldestDays: number };
export type PortfolioInvoice = { id: string; docNumber: string | null; dueDate: string; balance: string };
export type PortfolioClientIn = {
  id: string;
  name: string;
  programs: number;
  boards: PortfolioBoard[];
  lastMet: string | null;
  overdueInvoices: PortfolioInvoice[];
};
export type PortfolioCard = {
  id: string;
  name: string;
  href: string;
  sub: string;
  status: PortfolioStatus;
  open: number;
  late: number;
  blocked: number;
  /** Plain facts under the figures: the money, the last meeting. */
  facts: string[];
  next: { label: string; href: string | null };
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const RANK: Record<PortfolioStatus, number> = { needs: 0, quiet: 1, ok: 2 };

export function portfolioCard(c: PortfolioClientIn, today: string): PortfolioCard {
  const open = c.boards.reduce((n, b) => n + b.open, 0);
  const late = c.boards.reduce((n, b) => n + b.overdue, 0);
  const blocked = c.boards.reduce((n, b) => n + b.blocked, 0);
  const sinceMet = c.lastMet ? diffDays(c.lastMet.slice(0, 10), today) : null;
  const invoice = c.overdueInvoices[0] ?? null;
  const status: PortfolioStatus = invoice || late > 0 || blocked > 0 ? "needs" : open === 0 && (sinceMet === null || sinceMet > QUIET_DAYS) ? "quiet" : "ok";
  const hub = `/admin/revenue/companies/${c.id}?from=client-hubs`;
  const worst = (key: "overdue" | "blocked") => [...c.boards].sort((a, b) => b[key] - a[key])[0];

  const facts = [
    invoice ? `${plural(c.overdueInvoices.length, "invoice")} past due, ${invoice.balance} on the oldest` : null,
    c.lastMet ? `Last met ${sinceMet === 0 ? "today" : `${plural(sinceMet!, "day")} ago`}` : "No meeting on record",
  ].filter((f): f is string => f !== null);

  const next: PortfolioCard["next"] = invoice
    ? { label: `Chase invoice ${invoice.docNumber ?? ""}, ${plural(diffDays(invoice.dueDate, today), "day")} overdue`.replace("  ", " "), href: "/admin/revenue/invoices" }
    : late > 0
      ? { label: `${plural(late, "late card")} on ${worst("overdue").name}`, href: `/admin/boards/${worst("overdue").slug}` }
      : blocked > 0
        ? { label: `${plural(blocked, "blocked card")} on ${worst("blocked").name}`, href: `/admin/boards/${worst("blocked").slug}` }
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
    late,
    blocked,
    facts,
    next,
  };
}

/** The cards, the ones that need the reader first, then quiet, then on track; most late work first within each. */
export function portfolio(clients: PortfolioClientIn[], today: string): PortfolioCard[] {
  return clients
    .map((c) => portfolioCard(c, today))
    .sort((a, b) => RANK[a.status] - RANK[b.status] || b.late + b.blocked - (a.late + a.blocked) || a.name.localeCompare(b.name));
}

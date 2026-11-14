import { describe, expect, it } from "vitest";
import { portfolio, portfolioCard, type PortfolioClientIn } from "./client-portfolio";

// Client Hubs' cards (AH.6): a status worked out from the data, never set by
// hand, and one next thing to do. Company names are invented.
const TODAY = "2026-11-13";
const board = (o: Partial<PortfolioClientIn["boards"][number]> = {}) => ({ name: "Foundation", slug: "foundation", open: 5, overdue: 0, blocked: 0, oldestDays: 4, ...o });
const client = (o: Partial<PortfolioClientIn> = {}): PortfolioClientIn => ({ id: "c1", name: "Acme", programs: 1, boards: [board()], lastMet: "2026-11-10", overdueInvoices: [], ...o });

describe("portfolioCard", () => {
  it("needs the reader for a late card, and points at the board that has it", () => {
    const c = portfolioCard(client({ boards: [board({ overdue: 3, name: "Rollout", slug: "rollout" }), board()] }), TODAY);
    expect([c.status, c.late, c.open]).toEqual(["needs", 3, 10]);
    expect(c.next).toEqual({ label: "3 late cards on Rollout", href: "/admin/boards/rollout" });
  });

  it("puts an invoice past due ahead of late work", () => {
    const c = portfolioCard(client({ boards: [board({ overdue: 2 })], overdueInvoices: [{ id: "i1", docNumber: "1042", dueDate: "2026-11-01", balance: "$4,000.00" }] }), TODAY);
    expect(c.status).toBe("needs");
    expect(c.next.label).toBe("Chase invoice 1042, 12 days overdue");
    expect(c.facts[0]).toBe("1 invoice past due, $4,000.00 on the oldest");
  });

  it("calls a client with no open work and no meeting in a month quiet, and says to check in", () => {
    const c = portfolioCard(client({ boards: [board({ open: 0 })], lastMet: "2026-10-02" }), TODAY);
    expect(c.status).toBe("quiet");
    expect(c.next).toEqual({ label: "Check in: no meeting in 42 days", href: "/admin/revenue/companies/c1?from=client-hubs" });
  });

  it("leaves a client with work moving and nothing late on track, with nothing to do", () => {
    const c = portfolioCard(client(), TODAY);
    expect([c.status, c.next]).toEqual(["ok", { label: "Nothing waiting on you", href: null }]);
    expect(c.facts).toEqual(["Last met 3 days ago"]);
  });
});

describe("portfolio", () => {
  it("orders the clients that need the reader first, then quiet, then on track", () => {
    const cards = portfolio(
      [client({ id: "a", name: "Able" }), client({ id: "q", name: "Quill", boards: [], lastMet: null }), client({ id: "n", name: "Ned", boards: [board({ blocked: 1 })] })],
      TODAY,
    );
    expect(cards.map((c) => [c.name, c.status])).toEqual([
      ["Ned", "needs"],
      ["Quill", "quiet"],
      ["Able", "ok"],
    ]);
  });
});

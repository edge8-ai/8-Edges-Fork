import { describe, expect, it } from "vitest";
import { portfolio, portfolioCard, type PortfolioClientIn } from "./client-portfolio";

// Client Hubs' cards (AH.6, AH.7.2): a status worked out from the data, never
// set by hand, red only for a real problem, and one next thing to do. Company
// names are invented.
const TODAY = "2026-11-13";
const board = (o: Partial<PortfolioClientIn["boards"][number]> = {}) => ({ name: "Foundation", slug: "foundation", open: 5, clientLate: [], oldBlockers: [], lastMoveDays: 2, ...o });
const client = (o: Partial<PortfolioClientIn> = {}): PortfolioClientIn => ({ id: "c1", name: "Acme", programs: 1, boards: [board()], lastMet: "2026-11-10", overdueInvoices: [], blockersOnReader: [], ...o });
const invoice = (dueDate: string) => ({ id: "i1", docNumber: "1042", dueDate, balance: "$4,000.00" });
const late = (dueMoves: number) => ({ id: "k1", title: "Payroll import", lateDays: 12, dueMoves });

describe("portfolioCard: what needs the reader", () => {
  it("needs the reader for an invoice more than 90 days overdue, and says to chase it", () => {
    const c = portfolioCard(client({ overdueInvoices: [invoice("2026-07-20")] }), TODAY);
    expect(c.status).toBe("needs");
    expect(c.reasons[0].text).toBe("Invoice 1042, $4,000.00, 116 days overdue");
    expect(c.next).toEqual({ label: "Chase invoice 1042", href: "/admin/revenue/invoices" });
  });

  it("needs the reader for a blocker that names them", () => {
    const c = portfolioCard(client({ blockersOnReader: [{ blockerId: "k9", cardTitle: "SSO", text: "API key decision", boardSlug: "rollout" }] }), TODAY);
    expect(c.status).toBe("needs");
    expect(c.next).toEqual({ label: 'Clear the blocker on "SSO"', href: "/admin/boards/rollout" });
    expect(c.reasons[0].clear).toEqual({ blockerId: "k9", boardSlug: "rollout" });
  });

  it("needs the reader for a client-visible card still late after its date moved twice", () => {
    const c = portfolioCard(client({ boards: [board({ name: "Rollout", slug: "rollout", clientLate: [late(2)] })] }), TODAY);
    expect(c.status).toBe("needs");
    expect(c.reasons[0].text).toBe('"Payroll import" moved twice, 12 days late');
  });
});

describe("portfolioCard: what is at risk", () => {
  it("calls an invoice 31 to 90 days overdue at risk, not red", () => {
    expect(portfolioCard(client({ overdueInvoices: [invoice("2026-09-30")] }), TODAY).status).toBe("risk");
  });

  it("calls a client-visible card more than a week late at risk, and groups several on one board", () => {
    const c = portfolioCard(client({ boards: [board({ name: "Rollout", clientLate: [late(0), { ...late(1), id: "k2" }] })] }), TODAY);
    expect(c.status).toBe("risk");
    expect(c.reasons[0].text).toBe("2 client cards more than a week late on Rollout");
  });

  it("calls a blocker open more than two weeks at risk", () => {
    const c = portfolioCard(client({ boards: [board({ oldBlockers: [{ cardTitle: "Import", days: 21 }] })] }), TODAY);
    expect([c.status, c.reasons[0].text]).toEqual(["risk", 'Blocker on "Import" open 21 days']);
  });

  it("calls open work with no meeting and no card moved in 30 days at risk", () => {
    const c = portfolioCard(client({ boards: [board({ lastMoveDays: 40 })], lastMet: "2026-09-01" }), TODAY);
    expect([c.status, c.next.label]).toEqual(["risk", "Check in"]);
  });
});

describe("portfolioCard: what is normal", () => {
  it("leaves a young invoice, a young blocker and late internal work on track, with the money as a plain fact", () => {
    // Internal late cards never reach clientLate, and a blocker under two
    // weeks never reaches oldBlockers (flow-metrics.ts), so neither appears here.
    const c = portfolioCard(client({ overdueInvoices: [invoice("2026-11-01")] }), TODAY);
    expect([c.status, c.reasons, c.next]).toEqual(["ok", [], { label: "Nothing waiting on you", href: null }]);
    expect(c.facts).toEqual(["1 invoice just past due, $4,000.00 on the oldest", "5 open cards · last met 3 days ago"]);
  });

  it("calls a client with no open work and no meeting in a month quiet, and says to check in", () => {
    const c = portfolioCard(client({ boards: [board({ open: 0 })], lastMet: "2026-10-02" }), TODAY);
    expect(c.status).toBe("quiet");
    expect(c.next).toEqual({ label: "Check in: no meeting in 42 days", href: "/admin/revenue/companies/c1?from=client-hubs" });
  });

  it("shows at most three reasons, the red ones first", () => {
    const c = portfolioCard(
      client({ overdueInvoices: [invoice("2026-10-01"), { ...invoice("2026-07-01"), id: "i2", docNumber: "900" }], boards: [board({ clientLate: [late(0)], oldBlockers: [{ cardTitle: "X", days: 30 }] })] }),
      TODAY,
    );
    expect(c.reasons.map((r) => r.level)).toEqual(["needs", "risk", "risk"]);
    expect(c.reasons[0].action).toBe("Chase invoice 900");
  });
});

describe("portfolio", () => {
  it("orders needs you, then at risk, then quiet, then on track", () => {
    const cards = portfolio(
      [
        client({ id: "a", name: "Able" }),
        client({ id: "q", name: "Quill", boards: [], lastMet: null }),
        client({ id: "r", name: "Rook", overdueInvoices: [invoice("2026-09-30")] }),
        client({ id: "n", name: "Ned", overdueInvoices: [invoice("2026-07-01")] }),
      ],
      TODAY,
    );
    expect(cards.map((c) => [c.name, c.status])).toEqual([
      ["Ned", "needs"],
      ["Rook", "risk"],
      ["Quill", "quiet"],
      ["Able", "ok"],
    ]);
  });
});

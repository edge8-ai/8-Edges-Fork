import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script, tick, timeline as ordered } from "@/kernel/data/testing/fake-company-os";

// Whether a QuickBooks mirror pass states its payments (S.2).
//
// invoice-paid.test.ts pins `paidTransitions` and `paymentCandidatesFor` as pure
// pieces. What it cannot see is the ordering that makes them mean anything,
// which lives here: the stored rows have to be read BEFORE the upsert, and the
// facts announced AFTER it. Swap those two lines and every stored row already
// reads "paid" by the time it is compared, `paidTransitions` returns nothing
// for ever, and crm never learns that an account started paying — with the
// whole suite green.
//
// The kernel fake answers each table's queries in call order, and that order is
// the property: the ledger read is scripted with the unpaid rows and the upsert
// with nothing. Swap the two lines in production and the read receives the
// upsert's empty answer, finds nothing owed, and the first test goes red. The
// announce is stamped on the fake's clock, which also stamps each query when
// it is ANSWERED (W.135), so "read, write, then announce" is asserted directly
// and an announce raced against the upsert in a Promise.all cannot pass.

const stamped: { at: number; label: string }[] = [];
const timeline = () => ordered(stamped);

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table) },
  supabase: { from: (table: string) => builderFor(table) },
  htt: { from: (table: string) => builderFor(table) },
}));

// The invoice history the pass writes (S.19.8).
const audited: Record<string, unknown>[] = [];
vi.mock("@/kernel/audit/audit", () => ({
  recordAuditMany: async (rows: Record<string, unknown>[]) => void audited.push(...rows),
}));

const invoices: unknown[] = [];
vi.mock("@/entities/company-os/lib/qbo", () => ({
  listQboInvoices: async () => ({ ok: true, invoices }),
}));

// Today's rate, used only when QuickBooks sent none.
const usdRate = vi.hoisted(() => vi.fn(async () => ({ rate: 0.6, asOf: "2026-10-10" })));
vi.mock("@/kernel/data/fx", () => ({ usdRate }));

import { saigonToday } from "@/kernel/config/dates";
import { resetSubscribers, subscribe } from "@/kernel/events";
import { syncQboInvoices } from "./qbo-invoice-sync";

/** One QuickBooks invoice, settled or not. A zero balance derives as paid. */
const qbo = (externalId: string, balanceCents: number) => ({
  externalId,
  docNumber: `INV-${externalId}`,
  txnDate: "2026-09-01",
  dueDate: "2026-09-15",
  currency: "usd",
  amountCents: 120_000,
  balanceCents,
  exchangeRate: null as number | null,
  memo: null,
  customerId: "cust-1",
  customerName: "Acme",
  lines: [],
});

const published: unknown[] = [];

const UNPAID = [
  { id: "inv-1", source: "quickbooks", entity: "edge8", external_id: "101", status: "overdue", company_id: "co-1", deal_id: "deal-1" },
  { id: "inv-2", source: "quickbooks", entity: "edge8", external_id: "102", status: "open", company_id: "co-1", deal_id: null },
];

/** The stored rows the ledger read returns, then what the upsert answers. */
function scriptLedger(unpaid: typeof UNPAID, upsertError: { message: string } | null = null) {
  script("invoices", { data: unpaid }, { error: upsertError });
}

beforeEach(() => {
  resetFake();
  invoices.length = 0;
  // The customer mapping read, then the client-start-date read.
  script("companies", { data: [{ id: "co-1", metadata: { qbo_customer_ids: ["cust-1"] } }] }, { data: [] });
  stamped.length = 0;
  published.length = 0;
  audited.length = 0;
  resetSubscribers();
  subscribe("test", "invoice.paid", (payload) => {
    stamped.push({ at: tick(), label: "publish:invoice.paid" });
    published.push(payload);
  });
});
afterEach(() => {
  resetSubscribers();
  vi.clearAllMocks();
});

describe("syncQboInvoices", () => {
  it("announces the invoices this pass settled, reading the ledger before the upsert", async () => {
    invoices.push(qbo("101", 0), qbo("102", 40_000));
    scriptLedger(UNPAID);

    await expect(syncQboInvoices("edge8")).resolves.toMatchObject({ ok: true, upserted: 2 });

    expect(published).toEqual([
      {
        invoiceId: "inv-1",
        companyId: "co-1",
        dealId: "deal-1",
        amountCents: 120_000,
        currency: "usd",
        paidOn: saigonToday(),
      },
    ]);
    // Read the stored rows, write the mirror, then state the facts. Reading
    // after the write finds nothing owed and announces nothing for ever.
    expect(timeline().filter((t) => t.startsWith("invoices:") || t.startsWith("publish:"))).toEqual([
      "invoices:select",
      "invoices:upsert",
      "publish:invoice.paid",
    ]);
    // Every status it changed goes on that invoice's own history: the payment,
    // and the open invoice whose due date has passed.
    expect(audited).toEqual([
      expect.objectContaining({ table: "invoices", recordId: "inv-1", oldData: { status: "overdue" }, newData: { status: "paid" } }),
      expect.objectContaining({ table: "invoices", recordId: "inv-2", oldData: { status: "open" }, newData: { status: "overdue" } }),
    ]);
  });

  it("writes nothing when it cannot read which rows are payments", async () => {
    // The upsert would overwrite the only row that shows the payment, so a pass
    // that cannot read it stops, and the next pass still sees the transition.
    invoices.push(qbo("101", 0));
    script("invoices", { error: { message: "connection reset" } });

    await expect(syncQboInvoices("edge8")).resolves.toMatchObject({ ok: false });

    expect(timeline()).not.toContain("invoices:upsert");
    expect(published).toEqual([]);
    expect(audited).toEqual([]);
  });

  it("announces nothing when the upsert fails", async () => {
    // A subscriber marking an account a customer off a row the upsert never
    // wrote would be reacting to a ledger that does not say what it thinks.
    invoices.push(qbo("101", 0));
    scriptLedger(UNPAID, { message: "duplicate key" });

    await expect(syncQboInvoices("edge8")).resolves.toMatchObject({ ok: false, error: "duplicate key" });

    expect(published).toEqual([]);
  });

  it("announces nothing on a pass that re-writes invoices the ledger already had paid", async () => {
    // The mirror re-upserts every invoice since 2025 every week. Only a
    // transition is a payment; a row that was already paid is not one.
    invoices.push(qbo("101", 0), qbo("102", 0));
    scriptLedger([]);

    await expect(syncQboInvoices("edge8")).resolves.toMatchObject({ ok: true });

    expect(published).toEqual([]);
  });

  // Revenue is reported in US dollars: the USD columns are written at the rate
  // QuickBooks booked on the invoice, so they match the books.
  describe("the USD value of each invoice", () => {
    const upserted = () =>
      calls.find((c) => c.table === "invoices" && c.ops.includes("upsert"))!.payloads[0] as Record<string, unknown>[];

    it("converts a foreign invoice at QuickBooks' own rate, and a USD invoice at 1", async () => {
      invoices.push({ ...qbo("201", 1_500_000), currency: "aud", amountCents: 1_500_000, exchangeRate: 0.6693 }, qbo("202", 0));
      scriptLedger([]);
      await syncQboInvoices("edge8");
      expect(upserted()).toEqual([
        expect.objectContaining({ external_id: "201", amount_cents: 1_500_000, currency: "aud", amount_usd_cents: 1_003_950, balance_usd_cents: 1_003_950, fx_rate: 0.6693 }),
        expect.objectContaining({ external_id: "202", amount_cents: 120_000, amount_usd_cents: 120_000, balance_usd_cents: 0, fx_rate: 1 }),
      ]);
      expect(usdRate).not.toHaveBeenCalled();
    });

    it("falls back to today's rate only when QuickBooks sent none", async () => {
      invoices.push({ ...qbo("203", 0), currency: "aud", amountCents: 100_000 });
      scriptLedger([]);
      await syncQboInvoices("edge8");
      expect(upserted()[0]).toMatchObject({ amount_usd_cents: 60_000, fx_rate: 0.6 });
    });

    it("leaves an invoice unconverted, not at par, when no rate can be found", async () => {
      usdRate.mockRejectedValueOnce(new Error("no rate"));
      invoices.push({ ...qbo("204", 0), currency: "vnd", amountCents: 100_000 });
      scriptLedger([]);
      await expect(syncQboInvoices("edge8")).resolves.toMatchObject({ ok: true });
      expect(upserted()[0]).toMatchObject({ amount_cents: 100_000, amount_usd_cents: null, fx_rate: null });
    });
  });
});

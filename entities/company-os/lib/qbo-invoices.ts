import { qboFetch, type QboEntity } from "@/entities/company-os/lib/qbo";
import { saigonToday } from "@/kernel/config/dates";

// The QuickBooks invoice calls: create, send and list. Server-only, like the
// connection layer in ./qbo.ts that every call here goes through (qboFetch
// owns the tokens and the realm). Split from qbo.ts in Y.93 so the connection
// layer, where token rotation lives, reads as one module.

export type QboInvoice = {
  id: string;
  docNumber: string | null;
  txnDate: string;
  dueDate: string | null;
  totalCents: number;
  currency: string;
};

type QboInvoiceJson = {
  Id?: string;
  DocNumber?: string;
  TxnDate?: string;
  DueDate?: string;
  TotalAmt?: number;
  CurrencyRef?: { value?: string };
};

// One service line: hours × rate against the "Contractor Services" item.
export async function createQboInvoice(args: {
  customerId: string;
  hours: number;
  rateCents: number;
  description: string;
  memo?: string;
}): Promise<{ ok: true; invoice: QboInvoice } | { ok: false; error: string }> {
  const itemId = process.env.QBO_SERVICE_ITEM_ID;
  if (!itemId) return { ok: false, error: "QBO_SERVICE_ITEM_ID is not set." };

  const rate = args.rateCents / 100;
  const amount = Math.round(args.hours * args.rateCents) / 100;
  const body = {
    CustomerRef: { value: args.customerId },
    Line: [
      {
        DetailType: "SalesItemLineDetail",
        Amount: amount,
        Description: args.description,
        SalesItemLineDetail: {
          ItemRef: { value: itemId },
          Qty: args.hours,
          UnitPrice: rate,
        },
      },
    ],
    ...(args.memo ? { PrivateNote: args.memo } : {}),
  };

  const res = await qboFetch("/invoice", { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) return res;

  const inv = (res.json.Invoice ?? {}) as QboInvoiceJson;
  if (!inv.Id) return { ok: false, error: "QBO returned no invoice id." };
  return {
    ok: true,
    invoice: {
      id: inv.Id,
      docNumber: inv.DocNumber ?? null,
      txnDate: inv.TxnDate ?? saigonToday(),
      dueDate: inv.DueDate ?? null,
      totalCents: Math.round((inv.TotalAmt ?? amount) * 100),
      currency: (inv.CurrencyRef?.value ?? "USD").toLowerCase(),
    },
  };
}

// QBO emails the invoice to the customer (their billing email on the QBO
// customer record, or an explicit override).
export async function sendQboInvoice(
  invoiceId: string,
  toEmail?: string,
): Promise<{ ok: boolean; error?: string }> {
  const path = toEmail
    ? `/invoice/${invoiceId}/send?sendTo=${encodeURIComponent(toEmail)}`
    : `/invoice/${invoiceId}/send`;
  const res = await qboFetch(path, { method: "POST" });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

// One invoice as QBO returns it, flattened to what the mirror stores. Kept
// here (QBO-shaped) so lib/admin/qbo-invoice-sync.ts deals only in DB rows.
export type QboSyncLine = { description: string; quantity: number; rate: number; amount: number; item_name: string };
export type QboSyncInvoice = {
  externalId: string; // bare QBO Invoice.Id
  docNumber: string | null;
  txnDate: string;
  dueDate: string | null;
  currency: string;
  amountCents: number;
  balanceCents: number;
  // US dollars per unit of the invoice currency, as QuickBooks booked it on
  // the invoice; null when QuickBooks sent none (a USD invoice needs none).
  exchangeRate: number | null;
  memo: string | null;
  customerId: string | null;
  customerName: string | null;
  lines: QboSyncLine[];
};

type QboQueryInvoice = QboInvoiceJson & {
  Balance?: number;
  ExchangeRate?: number;
  PrivateNote?: string;
  CustomerRef?: { value?: string; name?: string };
  Line?: Array<{
    Amount?: number;
    Description?: string;
    DetailType?: string;
    SalesItemLineDetail?: { ItemRef?: { name?: string }; Qty?: number; UnitPrice?: number };
  }>;
};

function parseInvoice(inv: QboQueryInvoice): QboSyncInvoice {
  const lines: QboSyncLine[] = (inv.Line ?? [])
    .filter((l) => l.DetailType === "SalesItemLineDetail")
    .map((l) => ({
      description: l.Description ?? "",
      quantity: l.SalesItemLineDetail?.Qty ?? 0,
      rate: l.SalesItemLineDetail?.UnitPrice ?? 0,
      amount: l.Amount ?? 0,
      item_name: l.SalesItemLineDetail?.ItemRef?.name ?? "",
    }));
  return {
    externalId: String(inv.Id ?? ""),
    docNumber: inv.DocNumber ?? null,
    txnDate: inv.TxnDate ?? "",
    dueDate: inv.DueDate ?? null,
    currency: (inv.CurrencyRef?.value ?? "USD").toLowerCase(),
    amountCents: Math.round((inv.TotalAmt ?? 0) * 100),
    balanceCents: Math.round((inv.Balance ?? 0) * 100),
    exchangeRate: typeof inv.ExchangeRate === "number" ? inv.ExchangeRate : null,
    memo: inv.PrivateNote ?? null,
    customerId: inv.CustomerRef?.value ?? null,
    customerName: inv.CustomerRef?.name ?? null,
    lines,
  };
}

// Pull every invoice for one company on/after `since` (YYYY-MM-DD), paging
// through the QBO query API (1000/page). Read-only; degrades to {ok:false}.
export async function listQboInvoices(
  entity: QboEntity,
  since: string,
): Promise<{ ok: true; invoices: QboSyncInvoice[] } | { ok: false; error: string }> {
  const PAGE = 1000;
  const out: QboSyncInvoice[] = [];
  let start = 1;
  // Bounded loop: 50 pages = 50k invoices, far beyond any real book.
  for (let guard = 0; guard < 50; guard++) {
    const sql =
      `select * from Invoice where TxnDate >= '${since}'` +
      ` order by TxnDate startposition ${start} maxresults ${PAGE}`;
    const res = await qboFetch(`/query?query=${encodeURIComponent(sql)}`, { method: "GET" }, entity);
    if (!res.ok) return res;
    const qr = (res.json.QueryResponse ?? {}) as { Invoice?: QboQueryInvoice[] };
    const batch = qr.Invoice ?? [];
    out.push(...batch.map(parseInvoice));
    if (batch.length < PAGE) break;
    start += PAGE;
  }
  return { ok: true, invoices: out };
}

// Shared row shape + helpers for the invoices ledger (server page + client shelf).
// No server imports here — the shelf is a client component.
import { NAME_COLUMNS, type NamedPerson } from "@/kernel/config/people-name";

export type InvoiceLine = {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  item_name: string;
};

export type InvoiceEntity = "edge8" | "aio";

export type InvoiceListRow = {
  id: string;
  external_id: string;
  entity: InvoiceEntity;
  doc_number: string | null;
  txn_date: string;
  due_date: string | null;
  currency: string;
  amount_cents: number;
  balance_cents: number;
  status: string;
  memo: string | null;
  customer_name: string | null;
  customer_id: string | null;
  lines: InvoiceLine[];
  company_id: string | null;
  companies: {
    name: string;
    person_companies: Array<{ is_primary: boolean; people: ({ id: string } & NamedPerson) | null }>;
  } | null;
};

export const INVOICE_SELECT =
  `id, external_id, entity, doc_number, txn_date, due_date, currency, amount_cents, balance_cents, status, memo, customer_name, customer_id, lines, company_id, companies(name, person_companies(is_primary, people(id, ${NAME_COLUMNS})))`;

export const ENTITY_LABEL: Record<InvoiceEntity, string> = { edge8: "Edge8", aio: "AIO" };

// Same convention as portal-assume: the is_primary link wins, else the first.
export function primaryContact(row: InvoiceListRow): ({ id: string } & NamedPerson) | null {
  const links = row.companies?.person_companies ?? [];
  const best = links.find((l) => l.is_primary) ?? links[0] ?? null;
  return best?.people ?? null;
}

// QBO deep link. external_id is the bare QBO Invoice txn id; the realm id is
// the QuickBooks company the invoice belongs to (entity).
const QBO_REALM_ID: Record<InvoiceEntity, string> = {
  edge8: "9341452654454281", // the registered entity
  aio: "9341455538178258", // the second brand
};

export function qboInvoiceUrl(externalId: string, entity: InvoiceEntity = "edge8"): string {
  const txnId = externalId.split(":").pop() ?? "";
  return `https://qbo.intuit.com/app/login?pagereq=${encodeURIComponent(`invoice?txnId=${txnId}`)}&deeplinkcompanyid=${QBO_REALM_ID[entity]}`;
}

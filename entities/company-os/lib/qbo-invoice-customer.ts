import { qboFetch, type QboEntity } from "./qbo";

// One invoice's live customer id, for mapping a synced row that predates
// invoices.customer_id (so the shelf can link it without a full re-sync).
// Kept out of qbo.ts, which is at its size cap. Read-only; degrades to
// {ok:false}. external_id is the bare QBO Invoice.Id.
export async function getQboInvoiceCustomerId(
  entity: QboEntity,
  externalId: string,
): Promise<{ ok: true; customerId: string | null } | { ok: false; error: string }> {
  // The id goes straight into the QBO query string, so keep it to the digits
  // QBO actually issues — never interpolate an unsanitized value.
  const id = (externalId.split(":").pop() ?? "").replace(/[^0-9]/g, "");
  if (!id) return { ok: false, error: "Invoice has no QuickBooks id." };
  const sql = `select Id, CustomerRef from Invoice where Id = '${id}'`;
  const res = await qboFetch(`/query?query=${encodeURIComponent(sql)}`, { method: "GET" }, entity);
  if (!res.ok) return res;
  const qr = (res.json.QueryResponse ?? {}) as { Invoice?: Array<{ CustomerRef?: { value?: string } }> };
  return { ok: true, customerId: qr.Invoice?.[0]?.CustomerRef?.value ?? null };
}

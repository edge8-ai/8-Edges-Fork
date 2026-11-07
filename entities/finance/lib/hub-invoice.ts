// The invoice row a client hub shows. It lives with the invoices it describes;
// the team hub and the admin company page both render it through this door.
// `memo` is deliberately absent so the shape is safe on client-facing surfaces.
export type HubInvoice = {
  id: string;
  docNumber: string | null;
  txnDate: string;
  dueDate: string | null;
  currency: string;
  amountCents: number;
  balanceCents: number;
  status: string;
};

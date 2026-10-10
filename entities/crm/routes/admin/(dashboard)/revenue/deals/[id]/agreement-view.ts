import { formatCents } from "@/kernel/ui/format";
import { signedDownloadForPath } from "@/entities/client-programs";
import { AGREEMENT_STATUS_LABEL, readAgreementHtml, type Agreement, type AgreementStatus } from "@/entities/crm/lib/agreements";
import { needsInvoice } from "@/entities/crm/lib/agreement-signing";

// What the deal page's agreement card shows, built on the server: the card is
// a client component and gets plain data, never the storage paths.

export type AgreementView = {
  id: string;
  title: string;
  status: AgreementStatus;
  statusLabel: string;
  signer: { name: string; title: string; email: string };
  fee: string;
  feeDescription: string;
  sha256: string;
  preparedAt: string;
  sentAt: string | null;
  edge8: { name: string; title: string; signedAt: string } | null;
  client: { name: string; title: string; signedAt: string } | null;
  // The rendered text, only while Edge8 still has to read and sign it.
  html: string | null;
  htmlError: string | null;
  signedCopyUrl: string | null;
  invoice: string | null;
  invoiceError: string | null;
  canRetryInvoice: boolean;
};

export async function agreementView(a: Agreement): Promise<AgreementView> {
  let html: string | null = null;
  let htmlError: string | null = null;
  if (a.status === "draft") {
    const r = await readAgreementHtml(a);
    if (r.ok) html = r.html;
    else htmlError = r.error;
  }
  let signedCopyUrl: string | null = null;
  if (a.client?.signedCopyPath) {
    const link = await signedDownloadForPath(a.client.signedCopyPath, `${a.header.title} (signed).html`);
    if (link.ok) signedCopyUrl = link.url;
  }
  const inv = a.client?.invoice;
  return {
    id: a.id,
    title: a.header.title,
    status: a.status,
    statusLabel: AGREEMENT_STATUS_LABEL[a.status],
    signer: { name: a.header.signer.name, title: a.header.signer.title, email: a.header.signer.email },
    fee: formatCents(a.header.fee.cents, a.header.fee.currency),
    feeDescription: a.header.fee.description,
    sha256: a.header.sha256,
    preparedAt: a.preparedAt,
    sentAt: a.sentAt,
    edge8: a.header.edge8 ? { name: a.header.edge8.name, title: a.header.edge8.title, signedAt: a.header.edge8.signedAt } : null,
    client: a.client ? { name: a.client.name, title: a.client.title, signedAt: a.client.signedAt } : null,
    html,
    htmlError,
    signedCopyUrl,
    invoice: inv && "qboId" in inv ? `Invoice ${inv.docNumber ?? inv.qboId}, ${formatCents(inv.amountCents, inv.currency)}${inv.emailed ? ", emailed" : ""}` : null,
    invoiceError: inv && "error" in inv ? inv.error : null,
    canRetryInvoice: needsInvoice(a),
  };
}

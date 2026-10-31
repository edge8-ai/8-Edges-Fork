import { formatCents } from "@/kernel/ui/format";
import { AGREEMENT_STATUS_LABEL, AGREEMENT_TYPE_LABEL, type Agreement, type AgreementStatus, type AgreementType } from "@/entities/crm/lib/agreements";
import { readAgreementDocument, signedAgreementLinks, type AgreementDocument } from "@/entities/crm/lib/agreement-documents";
import { needsInvoice, partyName } from "@/entities/crm/lib/agreement-signing";

// What an agreement card shows, built on the server: the card is a client
// component and gets plain data, never the storage paths.

export type AgreementView = {
  id: string;
  type: AgreementType;
  typeLabel: string;
  title: string;
  party: string;
  dealId: string | null;
  status: AgreementStatus;
  statusLabel: string;
  signer: { name: string; title: string; email: string };
  fee: string | null;
  feeDescription: string | null;
  sha256: string;
  preparedAt: string;
  sentAt: string | null;
  edge8: { name: string; title: string; signedAt: string } | null;
  client: { name: string; title: string; signedAt: string } | null;
  // The document, only while Edge8 still has to read and sign it.
  doc: AgreementDocument | null;
  signedCopyUrl: string | null;
  pdfUrl: string | null;
  invoice: string | null;
  invoiceError: string | null;
  canRetryInvoice: boolean;
};

export async function agreementView(a: Agreement): Promise<AgreementView> {
  const [doc, links] = await Promise.all([a.status === "draft" ? readAgreementDocument(a) : null, signedAgreementLinks(a)]);
  const inv = a.client?.invoice;
  const fee = a.header.fee;
  return {
    id: a.id,
    type: a.header.type,
    typeLabel: AGREEMENT_TYPE_LABEL[a.header.type],
    title: a.header.title,
    party: partyName(a),
    dealId: a.header.dealId,
    status: a.status,
    statusLabel: AGREEMENT_STATUS_LABEL[a.status],
    signer: { name: a.header.signer.name, title: a.header.signer.title, email: a.header.signer.email },
    fee: fee ? formatCents(fee.cents, fee.currency) : null,
    feeDescription: fee?.description ?? null,
    sha256: a.header.sha256,
    preparedAt: a.preparedAt,
    sentAt: a.sentAt,
    edge8: a.header.edge8 ? { name: a.header.edge8.name, title: a.header.edge8.title, signedAt: a.header.edge8.signedAt } : null,
    client: a.client ? { name: a.client.name, title: a.client.title, signedAt: a.client.signedAt } : null,
    doc,
    signedCopyUrl: links.signedCopyUrl,
    pdfUrl: links.pdfUrl,
    invoice: inv && "qboId" in inv ? `Invoice ${inv.docNumber ?? inv.qboId}, ${formatCents(inv.amountCents, inv.currency)}${inv.emailed ? ", emailed" : ""}` : null,
    invoiceError: inv && "error" in inv ? inv.error : null,
    canRetryInvoice: needsInvoice(a),
  };
}

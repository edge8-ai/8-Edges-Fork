import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePortalPermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge } from "@/kernel/ui/Badge";
import { formatCents, formatDate } from "@/kernel/ui/format";
import { AgreementDocumentView, SignAgreementForm, readAgreementDocument, signedAgreementLinks } from "@/entities/crm";
import { getAgreementForActor } from "@/entities/portal/lib/agreements";
import { signAgreementAction } from "./actions";

// One agreement in the client portal (E-signature). It exists here only for
// the named signer, once Edge8 has signed and sent it; everyone else gets the
// same 404 as an agreement that does not exist. An admin viewing the portal as
// the client sees the page as the client does, with the sign form replaced by
// a note, so the view can be checked without anyone signing for the client.
export default async function PortalAgreementPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const actor = await requirePortalPermission("surface.portal");
  const agreement = await getAgreementForActor(actor, id);
  if (!agreement) notFound();
  const { header, client } = agreement;
  const [doc, links] = await Promise.all([readAgreementDocument(agreement), signedAgreementLinks(agreement)]);
  const invoice = client?.invoice && "qboId" in client.invoice ? client.invoice : null;

  return (
    <>
      <PageHead
        eyebrow={<Link href="/portal">← Client Portal</Link>}
        title={header.title}
        sub={`${header.companyName ?? "Your company"} and Edge8`}
        action={agreement.status === "signed" ? <Badge tone="ok">Signed by both</Badge> : <Badge tone="warn">Waiting for your signature</Badge>}
      />

      <div className="admin-card admin-section-card u-mb-4">
        <AgreementDocumentView doc={doc} title={header.title} full />
      </div>

      <div className="admin-card admin-section-card u-mb-4">
        <h2 className="admin-card-title u-mb-3">Signatures</h2>
        <div className="admin-signature-row">
          {header.edge8 && (
            <div className="admin-signature">
              <div className="admin-kpi-label">Edge8</div>
              <div className="admin-signature-name">{header.edge8.name}</div>
              <div>{header.edge8.name}, {header.edge8.title}</div>
              <div className="admin-cell-muted">Signed {formatDate(header.edge8.signedAt)}</div>
            </div>
          )}
          {client ? (
            <div className="admin-signature">
              <div className="admin-kpi-label">{header.companyName ?? "Client"}</div>
              <div className="admin-signature-name">{client.name}</div>
              <div>{client.name}, {client.title}</div>
              <div className="admin-cell-muted">Signed {formatDate(client.signedAt)}</div>
            </div>
          ) : (
            <div className="admin-signature">
              <div className="admin-kpi-label">{header.companyName ?? "Client"}</div>
              <div className="admin-cell-muted">To be signed by {header.signer.name}, {header.signer.title}</div>
            </div>
          )}
        </div>
        <div className="admin-fingerprint u-mt-3">Agreement fingerprint (SHA-256): {header.sha256}</div>
      </div>

      {agreement.status === "sent" && doc.kind !== "error" && (
        <div className="admin-card admin-section-card u-mb-4">
          <h2 className="admin-card-title u-mb-2">Sign</h2>
          {header.fee && (
            <p className="admin-cell-muted u-mb-3">
              Signing raises the first invoice, {formatCents(header.fee.cents, header.fee.currency)} for {header.fee.description}, to {header.companyName ?? "your company"}.
            </p>
          )}
          {actor.impersonation ? (
            <div className="admin-alert">
              You are viewing as {header.signer.name}. Only {header.signer.name} can sign, from their own login.
            </div>
          ) : (
          <SignAgreementForm
            agreementId={agreement.id}
            sha256={header.sha256}
            consentText={`I agree to this agreement and I am authorised to sign it for ${header.companyName ?? "my company"}.`}
            defaultName={header.signer.name}
            defaultTitle={header.signer.title}
            sign={signAgreementAction}
          />
          )}
        </div>
      )}

      {agreement.status === "signed" && (
        <div className="admin-card admin-section-card">
          <h2 className="admin-card-title u-mb-2">Your copy</h2>
          {links.signedCopyUrl ? (
            <div className="u-row u-gap-2">
              {links.pdfUrl && <a className="admin-btn admin-btn--sm" href={links.pdfUrl}>Download the agreement (PDF)</a>}
              <a className="admin-btn admin-btn--sm" href={links.signedCopyUrl}>{links.pdfUrl ? "Download the signing record" : "Download the signed agreement"}</a>
            </div>
          ) : (
            <p className="admin-cell-muted">Your signed copy is being prepared. It will also arrive by email.</p>
          )}
          {invoice && (
            <p className="u-mt-3">
              Invoice {invoice.docNumber ?? ""} for {formatCents(invoice.amountCents, invoice.currency)} is in <Link href="/portal/invoices">Invoices</Link>.
            </p>
          )}
        </div>
      )}
    </>
  );
}

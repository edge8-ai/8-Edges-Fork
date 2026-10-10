import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePortalPermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge } from "@/kernel/ui/Badge";
import { formatCents, formatDate } from "@/kernel/ui/format";
import { readAgreementHtml } from "@/entities/crm";
import { signedDownloadForPath } from "@/entities/client-programs";
import { getAgreementForActor } from "@/entities/portal/lib/agreements";
import { SignAgreementForm } from "./SignAgreementForm";

// One agreement in the client portal (E-signature). It exists here only for
// the named signer, once Edge8 has signed and sent it; everyone else, an admin
// viewing the portal as the client included, gets the same 404 as an
// agreement that does not exist.
export default async function PortalAgreementPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const actor = await requirePortalPermission("surface.portal");
  const agreement = await getAgreementForActor(actor, id);
  if (!agreement) notFound();
  const { header, client } = agreement;
  const text = await readAgreementHtml(agreement);
  const signedCopy =
    client?.signedCopyPath ? await signedDownloadForPath(client.signedCopyPath, `${header.title} (signed).html`) : null;
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
        {text.ok ? (
          <div className="admin-idea-plan admin-agreement-text admin-agreement-text--full" dangerouslySetInnerHTML={{ __html: text.html }} />
        ) : (
          <div className="admin-alert admin-alert--err">
            This agreement cannot be shown right now ({text.error}). Please contact Edge8 before signing.
          </div>
        )}
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

      {agreement.status === "sent" && text.ok && (
        <div className="admin-card admin-section-card u-mb-4">
          <h2 className="admin-card-title u-mb-2">Sign</h2>
          <p className="admin-cell-muted u-mb-3">
            Signing raises the first invoice, {formatCents(header.fee.cents, header.fee.currency)} for {header.fee.description}, to {header.companyName ?? "your company"}.
          </p>
          <SignAgreementForm
            agreementId={agreement.id}
            sha256={header.sha256}
            companyName={header.companyName ?? "my company"}
            defaultName={header.signer.name}
            defaultTitle={header.signer.title}
          />
        </div>
      )}

      {agreement.status === "signed" && (
        <div className="admin-card admin-section-card">
          <h2 className="admin-card-title u-mb-2">Your copy</h2>
          {signedCopy?.ok ? (
            <a className="admin-btn admin-btn--sm" href={signedCopy.url}>Download the signed agreement</a>
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

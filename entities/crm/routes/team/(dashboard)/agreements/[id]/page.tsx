import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import { AGREEMENT_TYPE_LABEL, getAgreement, mayTeamMemberSee } from "@/entities/crm/lib/agreements";
import { readAgreementDocument, signedAgreementLinks } from "@/entities/crm/lib/agreement-documents";
import { AgreementDocumentView } from "@/entities/crm/ui/AgreementDocumentView";
import { SignAgreementForm } from "@/entities/crm/ui/SignAgreementForm";
import { signTeamAgreementAction } from "./actions";

// One employee's or contractor's agreement in the Team pages (E-signature,
// AG.1). It exists here only for its named signer, once Edge8 has signed and
// sent it; everyone else gets the same 404 as an agreement that does not
// exist. An admin viewing the Team pages as the signer sees it, and cannot
// sign it.
export default async function TeamAgreementPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const access = await requirePermission("surface.team");
  const agreement = await getAgreement(id);
  if (!agreement || !mayTeamMemberSee(access.personId, agreement)) notFound();
  const { header, client } = agreement;
  const [doc, links] = await Promise.all([readAgreementDocument(agreement), signedAgreementLinks(agreement)]);

  return (
    <>
      <PageHead
        eyebrow={<Link href="/team">← Team</Link>}
        title={header.title}
        sub={`${AGREEMENT_TYPE_LABEL[header.type]} agreement between you and Edge8`}
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
          <div className="admin-signature">
            <div className="admin-kpi-label">{AGREEMENT_TYPE_LABEL[header.type]}</div>
            {client ? (
              <>
                <div className="admin-signature-name">{client.name}</div>
                <div>{client.name}, {client.title}</div>
                <div className="admin-cell-muted">Signed {formatDate(client.signedAt)}</div>
              </>
            ) : (
              <div className="admin-cell-muted">To be signed by {header.signer.name}, {header.signer.title}</div>
            )}
          </div>
        </div>
        <div className="admin-fingerprint u-mt-3">Agreement fingerprint (SHA-256): {header.sha256}</div>
      </div>

      {agreement.status === "sent" && doc.kind !== "error" && (
        <div className="admin-card admin-section-card u-mb-4">
          <h2 className="admin-card-title u-mb-2">Sign</h2>
          <SignAgreementForm
            agreementId={agreement.id}
            sha256={header.sha256}
            consentText="I have read this agreement and I agree to it."
            defaultName={header.signer.name}
            defaultTitle={header.signer.title}
            sign={signTeamAgreementAction}
          />
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
        </div>
      )}
    </>
  );
}

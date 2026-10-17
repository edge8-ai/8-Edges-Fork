import Link from "next/link";
import { requirePortalPermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import { listAgreementsForActor } from "@/entities/portal/lib/agreements";

// The client's agreements: the ones waiting for their signature first, then
// the ones already signed by both parties. Each opens its agreement page,
// where the text is shown and the named signer signs. The list is the same
// set the home card draws from, so an agreement never exists in one place and
// not the other; it is here so a client who scrolled past the card, or who
// came back weeks later for a signed copy, has somewhere to go.
export default async function PortalAgreementsPage() {
  const actor = await requirePortalPermission("surface.portal");
  const agreements = await listAgreementsForActor(actor);
  const toSign = agreements.filter((a) => a.status === "sent");
  const signed = agreements.filter((a) => a.status === "signed");

  return (
    <>
      <PageHead
        eyebrow="Client Portal"
        title="Agreements"
        sub={toSign.length > 0 ? `${toSign.length} waiting for your signature` : "Nothing waiting for your signature."}
      />

      {agreements.length === 0 ? (
        <div className="admin-card admin-section-card">
          <div className="admin-empty">No agreements yet.</div>
        </div>
      ) : (
        <>
          {toSign.length > 0 && (
            <>
              <div className="admin-hub-band-head">
                <h2 className="admin-card-title">To sign</h2>
              </div>
              <div className="admin-card admin-section-card admin-card--attention u-mb-4">
                <div className="admin-list">
                  {toSign.map((a) => (
                    <Link className="admin-list-row u-link-plain" key={a.id} href={`/portal/agreements/${a.id}`}>
                      <div className="admin-list-main">
                        <div className="admin-list-title">{a.header.title}</div>
                        <div className="admin-list-sub">
                          Signed by Edge8{a.header.edge8 ? ` on ${formatDate(a.header.edge8.signedAt)}` : ""}, waiting for {a.header.signer.name}
                        </div>
                      </div>
                      <div className="admin-list-aside"><Badge tone="warn">Sign</Badge></div>
                    </Link>
                  ))}
                </div>
              </div>
            </>
          )}

          {signed.length > 0 && (
            <>
              <div className="admin-hub-band-head">
                <h2 className="admin-card-title">Signed</h2>
              </div>
              <div className="admin-card admin-section-card u-mb-4">
                <div className="admin-list">
                  {signed.map((a) => (
                    <Link className="admin-list-row u-link-plain" key={a.id} href={`/portal/agreements/${a.id}`}>
                      <div className="admin-list-main">
                        <div className="admin-list-title">{a.header.title}</div>
                        <div className="admin-list-sub">
                          Signed by {a.client?.name ?? a.header.signer.name}{a.client ? ` on ${formatDate(a.client.signedAt)}` : ""}
                        </div>
                      </div>
                      <div className="admin-list-aside"><Badge tone="ok">Signed by both</Badge></div>
                    </Link>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}

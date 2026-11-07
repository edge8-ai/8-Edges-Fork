import Link from "next/link";
import { Badge } from "@/kernel/ui/Badge";
import type { Agreement } from "@/entities/portal/lib/agreements";

// The first card in the portal home's rail while an agreement waits for the
// client's signature, highlighted, above everything else that needs them,
// because nothing can start until it is signed (Dave, 2026-10-12). Hidden
// when nothing is waiting.
export function AgreementToSign({ agreements }: { agreements: Agreement[] }) {
  if (agreements.length === 0) return null;
  return (
    <>
    <div className="admin-hub-band-head">
      <h2 className="admin-card-title">Agreement to sign</h2>
      <span className="admin-cell-muted u-sm">work starts once it is signed</span>
    </div>
    <div className="admin-card admin-section-card admin-card--attention u-mb-4">
      <div className="admin-list">
        {agreements.map((a) => (
          <Link className="admin-list-row u-link-plain" key={a.id} href={`/portal/agreements/${a.id}`}>
            <div className="admin-list-main">
              <div className="admin-list-title">{a.header.title}</div>
              <div className="admin-list-sub">Signed by Edge8, waiting for {a.header.signer.name}</div>
            </div>
            <div className="admin-list-aside"><Badge tone="warn">Sign now</Badge></div>
          </Link>
        ))}
      </div>
    </div>
    </>
  );
}

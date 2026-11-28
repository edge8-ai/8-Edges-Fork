"use client";

import { EditableLink, type InlineSaveResult } from "@/kernel/ui/InlineEdit";

// A live (not voided) agreement on this deal, for the Documents row to point at
// until the client's signature fills contract_url.
export type DealAgreementLink = { id: string; title: string; statusLabel: string };

// The deal's Contract row: the e-signature agreements while they are in flight,
// jumping to their card further down the page, else the hand-entered link.
export function DealContractField({
  contractUrl,
  agreements,
  onSave,
}: {
  contractUrl: string | null;
  agreements: DealAgreementLink[];
  onSave: (v: string) => Promise<InlineSaveResult>;
}) {
  if (!contractUrl && agreements.length > 0) {
    return (
      <>
        {agreements.map((a) => (
          <div key={a.id}>
            <a href={`#agreement-${a.id}`}>{a.title}</a> · {a.statusLabel}
          </div>
        ))}
      </>
    );
  }
  return <EditableLink value={contractUrl ?? ""} onSave={onSave} placeholder="Add contract link…" ariaLabel="Contract link" />;
}

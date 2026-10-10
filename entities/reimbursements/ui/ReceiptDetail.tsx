// What opens under one receipt on a decider's claim page (RB.14): its
// documents, a photo shown and a PDF (a red invoice always is) opened in a
// tab; what the owner claimed beside what the AI read (design §1.9), the
// fields that differ marked; the reading's warnings and the buyer it compared;
// and the controls this decider may use on the receipt, which the page hands
// in, because they call the page's actions and nothing under ui/ may import a
// route. A receipt its owner removed, and a document they replaced, stay here,
// marked (plan §10, 20261008090000): nothing ever submitted is deleted.
import type { ReactNode } from "react";
import { DOCUMENT_KIND_LABEL } from "../lib/claim-labels";
import type { SignedDocument } from "../lib/claim-files";
import type { MyDocument, MyItem } from "../lib/my-claims";
import type { RedInvoiceBuyer } from "../lib/red-invoice-buyer";
import type { ReceiptCheck } from "../lib/review-facts";
import { ItemTags, RemovedNote, ReplacedBadge } from "./ItemTags";
import { ItemValue, LostReceiptNote } from "./ItemValue";
import { ReceiptFlags } from "./ReceiptFlags";

// What a browser shows inline; a PDF or a HEIC photo opens in a tab instead.
const INLINE = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Why the buyer was compared only in part, or not at all; null when it was compared in full. */
function buyerCaveat(buyer: RedInvoiceBuyer | undefined): string | null {
  switch (buyer?.state) {
    case "no_tax_code":
      return "The organisation's tax code is not configured yet, so only the buyer's name was compared.";
    case "not_configured":
      return "No Vietnamese legal entity is configured, so the buyer was not compared.";
    case "unavailable":
      return "The organisation's details could not be read just now.";
    default:
      return null;
  }
}

export type ReceiptDetailProps = {
  item: MyItem;
  check: ReceiptCheck;
  /** The claim's items, to name the receipt this one may duplicate when it is on the same claim. */
  others: MyItem[];
  documents: Map<string, SignedDocument>;
  open: (doc: MyDocument, kind: string) => ReactNode;
  buyer?: RedInvoiceBuyer;
  /** This decider's controls on the receipt: the rate by hand, decline, read again. Each is absent when they may not. */
  controls: ReactNode;
};

export function ReceiptDetail({ item, check, others, documents, open, buyer, controls }: ReceiptDetailProps) {
  const twin = item.duplicateOfItemId ? others.find((o) => o.id === item.duplicateOfItemId) : undefined;
  const caveat = item.reading?.is_red_invoice ? buyerCaveat(buyer) : null;
  return (
    <div className="admin-rb-detail">
      <div className="u-stack u-gap-2">
        {item.documents.length === 0 && <div className="admin-empty">No document.</div>}
        {item.documents.map((d) => (
          <Document key={d.id} doc={d} signed={documents.get(d.id)} open={open} />
        ))}
      </div>
      <div className="u-stack u-gap-3">
        <ItemValue item={item} />
        <ItemTags item={item} />
        {item.lostReceiptNote && <LostReceiptNote note={item.lostReceiptNote} />}
        <RemovedNote removed={item.removed} />
        {item.declined && <div className="admin-alert admin-alert--err">Declined: {item.declineReason}</div>}
        {check.rows.length > 0 ? (
          <table className="admin-rb-compare" aria-label={`What was claimed and what the AI read on ${item.label}`}>
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">Claimed</th>
                <th scope="col">AI read</th>
              </tr>
            </thead>
            <tbody>
              {check.rows.map((r) => (
                <tr key={r.field} className={r.differs ? "is-differs" : undefined}>
                  <th scope="row">{r.field}</th>
                  <td>{r.claimed}</td>
                  <td>{r.read}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          item.documents.length > 0 && <span className="admin-hint">The AI has not read this receipt.</span>
        )}
        {item.reading?.is_red_invoice && (
          <dl className="admin-kv">
            <dt>Buyer on the invoice</dt>
            <dd>{item.reading.buyer_name ?? "—"}</dd>
            <dt>Buyer tax code</dt>
            <dd className="u-tabular">{item.reading.buyer_tax_code ?? "—"}</dd>
          </dl>
        )}
        {check.hint && <div className="admin-alert admin-alert--warn">{check.hint}</div>}
        {caveat && <span className="admin-hint">{caveat}</span>}
        <ReceiptFlags flags={item.flags} />
        {item.flags.includes("possible_duplicate") && (
          <span className="admin-hint">{twin ? `It looks like ${twin.label} on this claim.` : "It looks like a receipt on another of their claims."}</span>
        )}
        {controls}
      </div>
    </div>
  );
}

function Document({ doc, signed, open }: { doc: MyDocument; signed: SignedDocument | undefined; open: ReceiptDetailProps["open"] }) {
  const kind = DOCUMENT_KIND_LABEL[doc.kind];
  const label = `${kind}: ${doc.filename}`;
  return (
    <div className="u-stack u-gap-1">
      {signed?.mimeType && INLINE.has(signed.mimeType) && (
        // A short window onto the photo; the open control beneath shows it at full size.
        <div className="admin-box admin-scroll-sm">
          {/* eslint-disable-next-line @next/next/no-img-element -- a signed, one-minute link to an uploaded photo of unknown size */}
          <img src={signed.url} alt={label} className="admin-img-thumb u-w-full" />
        </div>
      )}
      {open(doc, kind.toLowerCase())}
      <span className="admin-list-sub">
        {doc.filename} {doc.replacedAt && <ReplacedBadge />}
      </span>
    </div>
  );
}

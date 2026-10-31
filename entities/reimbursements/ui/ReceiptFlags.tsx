// The AI reading's warnings on one receipt (design §1.9), as the owner and the
// checker both read them. A warning, never a block: the owner can still
// submit, and the checker decides. Client-safe: it renders on the owner's
// client list and on the checker's server page alike.
import { RECEIPT_FLAG_LABEL, type ReceiptFlag } from "../lib/claim-labels";

export function ReceiptFlags({ flags }: { flags: ReceiptFlag[] }) {
  if (flags.length === 0) return null;
  return (
    <div className="admin-alert admin-alert--info" role="status">
      <span className="u-strong">Worth a look (a warning, not a block)</span>
      <ul className="u-stack u-gap-1">
        {flags.map((f) => (
          <li key={f}>{RECEIPT_FLAG_LABEL[f]}</li>
        ))}
      </ul>
    </div>
  );
}

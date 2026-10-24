import { formatDate } from "@/kernel/ui/format";
import type { LegalEntityChange } from "@/entities/org/lib/legal-entity-history";

// A legal entity's changes, newest first: what moved, who, when, and why.
export function LegalEntityHistory({ changes }: { changes: LegalEntityChange[] }) {
  if (changes.length === 0) return <div className="admin-cell-muted">No changes recorded yet.</div>;
  return (
    <ul className="u-list-plain u-stack u-gap-3">
      {changes.map((change) => (
        <li key={change.id} className="admin-quote">
          {change.lines.map((line) => (
            <div key={line} className="admin-cell-strong">
              {line}
            </div>
          ))}
          <div className="admin-cell-muted">
            {change.who} · {formatDate(change.at)}
          </div>
          {change.why && <div className="u-mt-1">“{change.why}”</div>}
        </li>
      ))}
    </ul>
  );
}

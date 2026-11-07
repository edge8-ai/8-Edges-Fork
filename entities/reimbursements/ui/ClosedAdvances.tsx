// A person's advances that have ended. The card on My claims is only for the open one, so
// without this a rejection's reason, how an advance ended and its papers had no way in.
import Link from "next/link";
import { Badge } from "@/kernel/ui/Badge";
import { formatVndWhole } from "@/kernel/ui/format";
import type { AdvanceRow } from "../lib/advance-lifecycle";
import { ADVANCE_STATUS_LABEL, ADVANCE_STATUS_TONE, advanceRef } from "../lib/advance-rules";
import { ownAdvancePath } from "../lib/paths";

export function ClosedAdvances({ advances }: { advances: AdvanceRow[] }) {
  if (advances.length === 0) return null;
  return (
    <section className="admin-card admin-section-card">
      <h2 className="admin-card-title">Earlier advances</h2>
      <div className="admin-list">
        {advances.map((a) => (
          <div key={a.id} className="admin-list-row">
            <div className="admin-list-main">
              <div className="admin-list-title">
                <Link href={ownAdvancePath(a.id)}>{a.purpose}</Link>
              </div>
              <div className="admin-list-sub admin-cell-mono">{advanceRef(a.refNo)}</div>
            </div>
            <div className="admin-list-aside">
              <span className="admin-cell-mono">{formatVndWhole(a.amountVnd)}</span>
              <Badge tone={ADVANCE_STATUS_TONE[a.status]}>{ADVANCE_STATUS_LABEL[a.status]}</Badge>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/kernel/identity/access-request";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate, formatVndWhole } from "@/kernel/ui/format";
import { PageHead } from "@/kernel/ui/PageHead";
import { Id } from "@/entities/reimbursements/lib/action-inputs";
import { formsOf } from "@/entities/reimbursements/lib/advance-forms";
import { readAdvanceForFinance } from "@/entities/reimbursements/lib/advance-queue";
import { ADVANCE_STATUS_LABEL_TO_OTHERS, ADVANCE_STATUS_TONE, PUT_BACK_LABEL, advanceRef } from "@/entities/reimbursements/lib/advance-rules";
import { AdvanceHistory } from "@/entities/reimbursements/ui/AdvanceHistory";
import { AdvanceLedger } from "@/entities/reimbursements/ui/AdvanceLedger";
import { AdvanceFormLinks } from "@/entities/reimbursements/ui/AdvancePaper";
import { OpenDocument } from "@/entities/reimbursements/ui/OpenDocument";
import { openAdvanceEvidenceInAdmin } from "../actions";

export const metadata = {
  title: "An Advance",
  description: "One advance, read-only: where it stands, its account 141 and its history.",
};

// /admin/finance/reimbursements/advances/[id]: one advance, read-only (AD.12). reimbursements.view
// is every claim without bank details, so this reads no account, shows only the quote and never a
// bank receipt, and leaves out even the masked record of where the money went.
export default async function AdminAdvancePage({ params }: { params: Promise<{ id: string }> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("reimbursements.view");
  const { id } = await params;
  if (!Id.safeParse(id).success) notFound();
  const advance = await readAdvanceForFinance(id);
  if (!advance) notFound();
  const { row, ownerName, spentVnd, approvedBy, account, files, events } = advance;
  // A put-back advance waits for its transfer to be recorded, not sent, and its badge says so,
  // as Finance's page and both queues do. Once the payout is recorded it reads like any other.
  const putBack = row.status === "approved" && events.some((e) => e.move === "reinstate");
  const base = `/admin/finance/reimbursements/advances/${row.id}`;
  return (
    <>
      <p className="u-mb-3"><Link href="/admin/finance/reimbursements/advances">← Advances</Link></p>
      <PageHead
        title={`${advanceRef(row.refNo)} · ${ownerName}`}
        sub={`${row.purpose}${approvedBy ? ` · approved by ${approvedBy}` : ""}`}
        action={
          <span className="u-row u-gap-1 u-items-center">
            <Badge tone={putBack ? "warn" : ADVANCE_STATUS_TONE[row.status]}>{putBack ? PUT_BACK_LABEL : ADVANCE_STATUS_LABEL_TO_OTHERS[row.status]}</Badge>
            <span className="admin-cell-mono u-strong">{formatVndWhole(row.amountVnd)}</span>
          </span>
        }
      />
      <div className="u-grid-2-1">
        <div className="u-stack u-gap-4">
          <AdvanceLedger account={account} owner={ownerName} />
          <AdvanceHistory events={events} viewer="decider" />
        </div>
        <div className="u-stack u-gap-4">
          <section className="admin-card admin-section-card">
            <h2 className="admin-card-title">Details</h2>
            <dl className="u-stack u-gap-1 u-m-0">
              <div><dt className="admin-label">Purchase or trip&apos;s last day</dt><dd className="u-m-0">{formatDate(row.spendEndsOn)}</dd></div>
              {row.settleBy && <div><dt className="admin-label">Settle by</dt><dd className="u-m-0">{formatDate(row.settleBy)}</dd></div>}
            </dl>
          </section>
          <AdvanceFormLinks kinds={formsOf({ status: row.status, submittedAt: row.submittedAt, spentVnd })} base={base} />
          <section className="admin-card admin-section-card">
            <h2 className="admin-card-title">Quote</h2>
            <div className="u-stack u-gap-2">
              {files.filter((f) => f.kind === "evidence").length === 0 && <span className="admin-hint">None.</span>}
              {files.filter((f) => f.kind === "evidence").map((f) => (
                <OpenDocument key={f.id} claimId={row.id} fileId={f.id} label={`${f.filename}${f.replaced ? " (set aside)" : ""}`} openFile={openAdvanceEvidenceInAdmin} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { saigonToday } from "@/kernel/config/dates";
import { requirePermission } from "@/kernel/identity/access-request";
import { mayProp } from "@/kernel/identity/may-prop";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { PageHead } from "@/kernel/ui/PageHead";
import { readRedInvoiceBuyer } from "@/entities/reimbursements";
import { Id } from "@/entities/reimbursements/lib/action-inputs";
import { advanceRef, ownerCanAdvance } from "@/entities/reimbursements/lib/advance-rules";
import { calendarForPreview, maskedAccount, readMyAdvance } from "@/entities/reimbursements/lib/my-advances";
import { readOwnBankDetails } from "@/entities/reimbursements/lib/own-bank-details";
import { listTrips } from "@/entities/reimbursements/lib/trips";
import { AdvanceForm } from "../../AdvanceForm";
import { AdvanceRules } from "@/entities/reimbursements/ui/AdvanceRules";

export const metadata = {
  title: "Change an Advance",
  description: "Change what your advance asks for and send it again.",
};

// /team/claims/advances/[id]/edit: a draft, or one sent back. Anything else goes to its
// page, and someone else's does not exist.
export default async function EditAdvancePage({ params }: { params: Promise<{ id: string }> }) {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("reimbursements.mine");
  const may = mayProp(access, ["reimbursements.mine"]);
  const actor = await requireTeamMember();
  const { id } = await params;
  if (!Id.safeParse(id).success) notFound();
  const advance = await readMyAdvance(id, actor.personId);
  if (!advance) notFound();
  const can = ownerCanAdvance({ status: advance.row.status, submittedAt: advance.row.submittedAt, settling: false });
  if (!can.edit) redirect(`/team/claims/advances/${advance.row.id}`);
  const [trips, holidays, bank, buyer] = await Promise.all([listTrips(), calendarForPreview(saigonToday()), readOwnBankDetails(actor.personId), readRedInvoiceBuyer()]);
  return (
    <>
      <p className="u-mb-3"><Link href={`/team/claims/advances/${advance.row.id}`}>← {advanceRef(advance.row.refNo)}</Link></p>
      <PageHead title={advance.row.status === "sent_back" ? "Fix your advance" : "Finish your advance"} sub={advance.facts.reason && advance.row.status === "sent_back" ? `${advance.facts.approver} asked: ${advance.facts.reason}` : undefined} />
      <div className="u-grid-2-1">
        <section className="admin-card admin-section-card">
          <AdvanceForm
            advance={{ id: advance.row.id, purpose: advance.row.purpose, amountVnd: advance.row.amountVnd, spendEndsOn: advance.row.spendEndsOn, tripEventId: advance.tripEventId }}
            evidence={advance.files.filter((f) => f.kind === "evidence" && !f.replaced).map((f) => ({ id: f.id, filename: f.filename }))}
            trips={trips}
            holidays={holidays}
            paidTo={maskedAccount(bank)}
            buyerName={"legalName" in buyer ? buyer.legalName : null}
            approver={advance.facts.approver}
            anotherOpen={false}
            may={may}
          />
        </section>
        <AdvanceRules approver={advance.facts.approver} />
      </div>
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { saigonToday } from "@/kernel/config/dates";
import { requirePermission } from "@/kernel/identity/access-request";
import { mayProp } from "@/kernel/identity/may-prop";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { PageHead } from "@/kernel/ui/PageHead";
import { readRedInvoiceBuyer } from "@/entities/reimbursements";
import { ADVANCES_OPEN } from "@/entities/reimbursements/lib/advance-policy";
import { approverName, calendarForPreview, maskedAccount, readMyOpenAdvance } from "@/entities/reimbursements/lib/my-advances";
import { readOwnBankDetails } from "@/entities/reimbursements/lib/own-bank-details";
import { listTrips } from "@/entities/reimbursements/lib/trips";
import { AdvanceForm } from "../AdvanceForm";
import { AdvanceRules } from "@/entities/reimbursements/ui/AdvanceRules";

export const metadata = {
  title: "Ask for an Advance",
  description: "Ask for money before you buy something for the company.",
};

// /team/claims/advances/new: the request (AD.5). Someone with an open advance is sent
// to it instead, since the law allows one at a time. Hidden until the whole road exists.
export default async function NewAdvancePage() {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("reimbursements.mine");
  const may = mayProp(access, ["reimbursements.mine"]);
  const actor = await requireTeamMember();
  if (!ADVANCES_OPEN) notFound();
  const [open, trips, holidays, bank, buyer, approver] = await Promise.all([
    readMyOpenAdvance(actor.personId),
    listTrips(),
    calendarForPreview(saigonToday()),
    readOwnBankDetails(actor.personId),
    readRedInvoiceBuyer(),
    approverName(actor.personId),
  ]);
  return (
    <>
      <p className="u-mb-3"><Link href="/team/claims">← My claims</Link></p>
      <PageHead title="Ask for an advance" sub={`Money from the company before you buy something for it. ${approver[0].toUpperCase()}${approver.slice(1)} checks it against your quote; Finance sends it by bank transfer, never cash.`} />
      <div className="u-grid-2-1">
        <section className="admin-card admin-section-card">
          <AdvanceForm advance={null} evidence={[]} trips={trips} holidays={holidays} paidTo={maskedAccount(bank)} buyerName={"legalName" in buyer ? buyer.legalName : null} approver={approver} anotherOpen={open !== null} may={may} />
        </section>
        <AdvanceRules approver={approver} />
      </div>
    </>
  );
}

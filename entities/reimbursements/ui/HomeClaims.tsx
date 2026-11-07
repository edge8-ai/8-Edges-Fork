// What Home shows of reimbursements, front and center (Dave, 2026-10-12):
// whatever waits on the viewer. The checker sees how many claims are to check,
// the approver how many are to approve, and the payer everything approved and
// waiting to be paid, which Payments lists person by person.
// Team's Home renders it through the HomeClaims slot (entities/reimbursements/slots.ts),
// so team never names this entity. Someone who holds none of the three atoms
// sees nothing, so it never links to a page that would refuse.
//
// A failed read of the payer's figure hides that block rather than failing
// Home: drawing "nothing to pay" on a failed read would be a wrong answer
// about money owed. It is logged. The queue counts already answer -1 on a
// failed read, and a -1 line is left out.
import Link from "next/link";
import { getAccess } from "@/kernel/identity/access-request";
import { ReadFailure } from "@/kernel/data/read";
import { formatDate, formatVndWhole } from "@/kernel/ui/format";
import { countQueues } from "../lib/check-queue";
import { readToPay, type ToPay } from "../lib/to-pay";

const PAYMENTS = "/team/finance/payment-runs";
const TO_CHECK = "/team/finance/claims/to-check";
// The approver's queue lives in Admin only (design §1.5); the approver is an admin.
const TO_APPROVE = "/admin/finance/reimbursements/to-approve";

export async function HomeClaims() {
  const access = await getAccess();
  if (!access?.personId) return null;
  const mayCheck = access.may("reimbursements.check");
  const mayApprove = access.may("reimbursements.approve");
  const mayPay = access.may("reimbursements.pay");
  if (!mayCheck && !mayApprove && !mayPay) return null;

  const [queues, toPay] = await Promise.all([
    mayCheck || mayApprove ? countQueues(access.personId, { includeOwn: access.may("reimbursements.decide-own") }) : null,
    mayPay ? readToPayOrNull() : null,
  ]);
  const toCheck = mayCheck && queues && queues.toCheck >= 0 ? queues.toCheck : null;
  const toApprove = mayApprove && queues && queues.toApprove >= 0 ? queues.toApprove : null;
  const waiting = toPay && toPay.claims > 0;
  const nothing = !toCheck && !toApprove && !waiting;

  return (
    <section className="th-card" aria-labelledby="th-claims-h">
      <div className="th-card-h">
        <h2 id="th-claims-h">Reimbursements</h2>
        {mayPay ? <Link href={PAYMENTS}>Payments →</Link> : mayCheck ? <Link href={TO_CHECK}>To check →</Link> : <Link href={TO_APPROVE}>To approve →</Link>}
      </div>
      <div className="th-pad u-stack u-gap-2">
        {nothing && <p className="th-meta">Nothing is waiting on you.</p>}
        {(toCheck !== null || toApprove !== null) && (toCheck || toApprove) ? (
          <div className="th-chips">
            {toCheck ? (
              <Link href={TO_CHECK} className="th-chip is-today">
                {toCheck} to check
              </Link>
            ) : null}
            {toApprove ? (
              <Link href={TO_APPROVE} className="th-chip is-today">
                {toApprove} to approve
              </Link>
            ) : null}
          </div>
        ) : null}
        {toPay && <ToPayBlock toPay={toPay} />}
      </div>
    </section>
  );
}

async function readToPayOrNull(): Promise<ToPay | null> {
  try {
    return await readToPay();
  } catch (e) {
    if (!(e instanceof ReadFailure)) throw e;
    console.error(`[reimbursements] Home card's To pay hidden: ${e.message}`);
    return null;
  }
}

function ToPayBlock({ toPay }: { toPay: ToPay }) {
  return (
    <>
      {toPay.claims > 0 && (
        <>
          <div className="th-chips">
            <Link href={PAYMENTS} className="th-chip is-late">
              {formatVndWhole(toPay.totalVnd)} to pay
            </Link>
            <span className="th-chip">
              {toPay.claims} {toPay.claims === 1 ? "claim" : "claims"} · {toPay.people} {toPay.people === 1 ? "person" : "people"}
            </span>
            {toPay.oldestApprovedAt && <span className="th-chip">Waiting since {formatDate(toPay.oldestApprovedAt)}</span>}
          </div>
          <p className="th-meta">Approved and not yet paid. Open Payments to pay each person by bank transfer and attach the receipt.</p>
        </>
      )}
    </>
  );
}

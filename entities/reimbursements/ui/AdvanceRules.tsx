// The rules in short, beside the request (AD.5). The numbers come from the policy
// module, so the form can't say something the code doesn't do.
import { formatVndWhole } from "@/kernel/ui/format";
import { ADVANCE_MAX_VND, SETTLE_WORKING_DAYS } from "../lib/advance-policy";

export function AdvanceRules({ approver }: { approver: string }) {
  return (
    <section className="admin-card admin-section-card">
      <h2 className="admin-card-title">The rules, in short</h2>
      <ul className="adv-why">
        <li>Anyone in the team portal can ask, employee or contractor.</li>
        <li>At most {formatVndWhole(ADVANCE_MAX_VND)}, one open advance at a time.</li>
        <li>{approver[0].toUpperCase() + approver.slice(1)} checks every amount against its quote.</li>
        <li>Sent by bank transfer as soon as it is approved.</li>
        <li>Settle within {SETTLE_WORKING_DAYS} working days with a claim of red invoices.</li>
        <li>Spent less: return the rest by transfer. Spent more: the company pays you the difference in the next run.</li>
      </ul>
      <p className="admin-hint u-mt-4">From the advances policy (quy chế tạm ứng) in the Handbook.</p>
    </section>
  );
}

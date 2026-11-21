// Claims for the Operations morning list (the Lark notifications plan): to
// check, to approve, approved but not in a run, and a run waiting to be
// released. Built here because reimbursements owns reimbursement_claims.

import { companyOs } from "@/kernel/data/supabase";
import { plural, rows, shortDate, type ListLine } from "@/kernel/messaging/office-list";

const MILLIONS = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export async function claimMorningLines(): Promise<ListLine[]> {
  const claims = await rows("claims", companyOs.from("reimbursement_claims").select("status, in_run_at, approved_total_vnd").in("status", ["submitted", "checked", "approved", "in_run"]));
  const of = (s: string) => claims.filter((c) => c.status === s);
  const lines: ListLine[] = [];
  if (of("submitted").length) lines.push({ who: "Claims checker", text: `${plural(of("submitted").length, "claim")} to check.`, href: "/admin/finance/reimbursements/to-check" });
  if (of("checked").length) lines.push({ who: "Claims approver", text: `${plural(of("checked").length, "claim")} to approve.`, href: "/admin/finance/reimbursements/to-approve" });
  if (of("approved").length) lines.push({ who: "Claims approver", text: `${plural(of("approved").length, "approved claim")} not yet in a payment run.`, href: "/admin/finance/reimbursements/approved" });
  const inRun = of("in_run");
  if (inRun.length) {
    const total = inRun.reduce((n, c) => n + Number(c.approved_total_vnd ?? 0), 0);
    const oldest = inRun.map((c) => c.in_run_at as string).filter(Boolean).sort()[0];
    lines.push({
      who: "Claims approver",
      text: `payment run waiting${oldest ? ` since ${shortDate(oldest)}` : ""}: ${plural(inRun.length, "approved claim")}, ${MILLIONS.format(total / 1_000_000)}M VND. Release it.`,
      href: "/admin/finance/reimbursements/payment-runs",
    });
  }
  return lines;
}

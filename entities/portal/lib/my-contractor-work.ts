// A contractor's own work and pay, for /team/my-work (Dave, 2026-10-10;
// docs/plans/2026-10-10-contractor-portal.md, PR 1). Until this page a
// contractor could report hours but never see what they had reported or
// whether a month had been paid: the only sign was the payment email.
//
// Every read is filtered to the person passed in, which the page takes from
// the signed-in team member, never from the URL. A failed read raises: an empty
// list here would tell a contractor they have not been paid when the truth is
// that the page could not look.
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { contractorPaymentsOf, ownCurrentPayRates } from "@/entities/finance";
import { workRequestPath } from "@/entities/company-os";

export type MyWorkRequest = {
  id: string;
  title: string;
  status: string;
  estimatedHours: number | null;
  hours: number | null;
  overtimeHours: number;
  createdAt: string;
  // The request's own link, the one its emails carry, while it still waits on
  // the contractor: an estimate to give, changes to make, or work to report.
  openHref: string | null;
};

export type MyPayment = {
  id: string;
  month: string;
  regularHours: number;
  overtimeHours: number;
  amountCents: number;
  currency: string;
  status: string;
  paidAt: string | null;
  note: string | null;
};

export type MyRate = { hourlyCents: number; overtimeCents: number | null; currency: string };

export type MyContractorWork = { requests: MyWorkRequest[]; payments: MyPayment[]; rate: MyRate | null };

// The statuses in which the next move is the contractor's.
const WAITING_ON_CONTRACTOR = new Set(["awaiting_estimate", "changes_requested", "scope_added", "approved"]);

// PostgREST returns numeric columns as numbers or strings depending on size.
function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : 0;
  return Number.isFinite(n) ? n : 0;
}

type RequestRow = {
  id: string;
  title: string;
  status: string;
  estimated_hours: number | string | null;
  actual_hours: number | string | null;
  actual_overtime_hours: number | string | null;
  created_at: string;
  access_token: string;
};

// `assumed` is true while a Super Admin views the page as this contractor
// (team-assume.ts). The /work/<token> link then stays off the page: that page
// sits outside /team, where the read-only rule does not reach, and the token
// in the link is the contractor's credential, so following it would let the
// admin submit an estimate or report hours as the contractor.
export async function loadMyContractorWork(personId: string, teamMemberId: string, { assumed = false }: { assumed?: boolean } = {}): Promise<MyContractorWork> {
  const [requestRes, paymentRes, compRes] = await Promise.all([
    companyOs
      .from("contractor_work_requests")
      .select("id, title, status, estimated_hours, actual_hours, actual_overtime_hours, created_at, access_token")
      .eq("person_id", personId)
      .neq("status", "draft")
      .order("created_at", { ascending: false }),
    contractorPaymentsOf(personId),
    ownCurrentPayRates(teamMemberId),
  ]);

  const requests = (mustRows(requestRes, "[portal/my-work] contractor_work_requests") as RequestRow[]).map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    estimatedHours: r.estimated_hours === null ? null : num(r.estimated_hours),
    hours: r.actual_hours === null ? null : num(r.actual_hours),
    overtimeHours: num(r.actual_overtime_hours),
    createdAt: r.created_at,
    openHref: !assumed && WAITING_ON_CONTRACTOR.has(r.status) ? workRequestPath(r.access_token) : null,
  }));

  const payments = mustRows(paymentRes, "[portal/my-work] contractor_payments").map((p) => ({
    id: p.id,
    month: p.period_month,
    regularHours: num(p.total_regular_hours),
    overtimeHours: num(p.total_overtime_hours),
    amountCents: num(p.amount_cents),
    currency: p.currency,
    status: p.status,
    paidAt: p.paid_at,
    note: p.note,
  }));

  const comps = mustRows(compRes, "[portal/my-work] compensation_sensitive");
  const hourly = comps.find((c) => c.comp_type === "hourly");
  const overtime = comps.find((c) => c.comp_type === "overtime");
  const rate = hourly
    ? {
        hourlyCents: num(hourly.amount_cents),
        // The monthly roll-up pays overtime at the hourly rate when no
        // overtime rate is set, so the page says the same.
        overtimeCents: overtime ? num(overtime.amount_cents) : null,
        currency: hourly.currency || "usd",
      }
    : null;

  return { requests, payments, rate };
}

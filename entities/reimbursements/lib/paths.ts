// Where a claim and a payment run show up, on both surfaces, written once.
// A move on a claim changes its owner's list and page, the checker's and the
// approver's queues and Admin's lists; a payment changes the run pages and
// the lists a paid or returned claim leaves or joins. Every action refreshes
// through these lists, so a page added here is refreshed by every move, and
// the emails link to the same run paths.
//
// Client-safe: no import reaches the server.

/** A run's page on the Team view, where the bookkeeper works (a Contractor with no Admin surface). */
export const teamRunPath = (runId: string) => `/team/finance/payment-runs/${runId}`;
/** The same run in Admin, where the employer and the Super Admins work. */
export const adminRunPath = (runId: string) => `/admin/finance/reimbursements/payment-runs/${runId}`;

/** One path for `revalidatePath`; `page` refreshes every page of a dynamic route. */
export type Revalidation = { path: string; type?: "page" };

const CLAIM_LISTS = [
  "/team/claims",
  "/team/finance/claims/to-check",
  "/admin/finance/reimbursements",
  "/admin/finance/reimbursements/to-check",
  "/admin/finance/reimbursements/to-approve",
  "/admin/finance/reimbursements/approved",
  "/admin/finance/reimbursements/paid",
];

/** Every page a move on one claim changes: the lists it sits in, and the claim on each surface. */
export function claimPaths(claimId?: string): Revalidation[] {
  const lists = CLAIM_LISTS.map((path) => ({ path }));
  if (!claimId) return lists;
  return [...lists, { path: `/team/claims/${claimId}` }, { path: `/team/finance/claims/${claimId}` }, { path: `/admin/finance/reimbursements/${claimId}` }];
}

/**
 * Every page a payment run's change touches: both run lists, the run on both
 * surfaces (every run when the caller does not know which), and the claim
 * lists its claims leave or join.
 */
export function runPaths(runId?: string): Revalidation[] {
  const runs: Revalidation[] = runId
    ? [{ path: teamRunPath(runId) }, { path: adminRunPath(runId) }]
    : [
        { path: "/team/finance/payment-runs/[id]", type: "page" },
        { path: "/admin/finance/reimbursements/payment-runs/[id]", type: "page" },
      ];
  return [{ path: "/team/finance/payment-runs" }, { path: "/admin/finance/reimbursements/payment-runs" }, ...runs, ...claimPaths()];
}

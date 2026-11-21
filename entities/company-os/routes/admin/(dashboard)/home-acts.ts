// What Admin Home's buttons act on (AH.5): for each waiting approval the
// reader may decide here, the values its owner's action needs. A claim needs
// the mark its decider's page reads (submitted-at and the total a check
// passes on), so a decision on a claim that changed since is refused; a
// writer draft needs the version the approval is for, so Publish never
// publishes a version other than the one the approval waits on.
//
// Each act is offered only when the reader holds the action's own permission,
// and the action asks again. A read that fails leaves the row as a link: the
// reader can still decide on the owner's page, so a failure costs a click,
// never a wrong answer.
import type { RequestAccess } from "@/kernel/identity/access-request";
import { formatVndWhole } from "@/kernel/ui/format";
import { publishApprovalView } from "@/entities/campaigns";
import { listClaimsToApprove, listClaimsToCheck, type ClaimToCheck } from "@/entities/reimbursements";
import type { RowAct } from "@/entities/company-os/lib/admin-home-types";
import type { WaitingApprovalRow } from "./waiting-approvals";

export type ApprovalAct = { act: RowAct | null; amount: string | null };

async function claims(read: () => Promise<ClaimToCheck[]>, where: string): Promise<Map<string, ClaimToCheck>> {
  try {
    return new Map((await read()).map((c) => [c.id, c]));
  } catch (err) {
    console.error(`[admin-home] ${where}, buttons left off`, err);
    return new Map();
  }
}

function claimAct(stage: "check" | "approve", c: ClaimToCheck | undefined): ApprovalAct {
  if (!c) return { act: null, amount: null };
  const amount = formatVndWhole(c.totalVnd);
  // A claim with a rate still pending is refused at the check, and one with a
  // flagged receipt is worth reading first: both stay a link to the claim.
  if (!c.submittedAt || c.ratePending > 0 || c.flagged > 0) return { act: null, amount };
  return { act: { kind: "claim", stage, claimId: c.id, mark: { submittedAt: c.submittedAt, totalVnd: c.totalVnd } }, amount };
}

export async function approvalActs(rows: WaitingApprovalRow[], access: RequestAccess): Promise<Map<string, ApprovalAct>> {
  const out = new Map<string, ApprovalAct>();
  const personId = access.personId;
  const has = (t: string) => rows.some((r) => r.subjectType === t);
  const scope = { includeOwn: access.may("reimbursements.decide-own") };
  const [toCheck, toApprove] = await Promise.all([
    personId && has("reimbursement_check") && access.may("reimbursements.check") ? claims(() => listClaimsToCheck(personId, scope), "claims to check") : null,
    personId && has("reimbursement_approval") && access.may("reimbursements.approve") ? claims(() => listClaimsToApprove(personId, scope), "claims to approve") : null,
  ]);
  const drafts = access.may("campaigns.marketing") ? rows.filter((r) => r.subjectType === "campaign_publish") : [];
  const views = await Promise.all(
    drafts.map(async (r) => {
      try {
        return [r.id, await publishApprovalView(r.subjectId)] as const;
      } catch (err) {
        console.error("[admin-home] writer draft version, button left off", err);
        return [r.id, null] as const;
      }
    }),
  );
  for (const r of rows) {
    if (r.subjectType === "reimbursement_check" && toCheck) out.set(r.id, claimAct("check", toCheck.get(r.subjectId)));
    if (r.subjectType === "reimbursement_approval" && toApprove) out.set(r.id, claimAct("approve", toApprove.get(r.subjectId)));
  }
  for (const [id, view] of views) {
    const subject = drafts.find((r) => r.id === id)!.subjectId;
    // Publish only the version the approval waits on, and only when it is the post as it stands.
    if (view?.pendingVersion && view.pendingVersion === view.currentVersion)
      out.set(id, { act: { kind: "draft", campaignId: subject, version: view.pendingVersion }, amount: null });
  }
  return out;
}

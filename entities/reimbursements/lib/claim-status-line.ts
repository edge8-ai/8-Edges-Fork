// The line the owner reads beside a claim, for each state it can be in. Client-safe.
import { formatDate, formatVndWhole } from "@/kernel/ui/format";
import { nextRunDate, type ClaimStatus } from "./claim-rules";

/** What the owner's status line reads from, as far as the claim has come. */
export type StatusFacts = {
  status: ClaimStatus;
  /** Who sent it back or rejected it, and why: the last decision's event. */
  decidedBy?: string | null;
  reason?: string | null;
  approvedTotalVnd?: number | null;
  approvedAt?: string | null;
  runDate?: string | null;
  paidVnd?: number | null;
  paidAt?: string | null;
  /** The claim settles an advance, so what it froze is only the difference. */
  settlesAdvance?: boolean;
};

/** The line the owner reads for each state (plan section 3). */
export function statusLine(c: StatusFacts): string {
  switch (c.status) {
    case "draft":
      return "Not sent yet.";
    case "submitted":
      return "Being checked by Finance / Accounting.";
    case "checked":
      return "Waiting for approval.";
    case "sent_back":
      return c.decidedBy && c.reason ? `Sent back by ${c.decidedBy}: ${c.reason}` : "Sent back to you to fix and resubmit.";
    case "rejected":
      return c.decidedBy && c.reason ? `Rejected by ${c.decidedBy}: ${c.reason}` : "Rejected.";
    case "approved": {
      const run = c.runDate ?? (c.approvedAt ? nextRunDate(c.approvedAt) : null);
      // A settlement's figure beside this line is what was spent, so its line says what this is.
      if (c.settlesAdvance) return `Approved. The company pays you the difference, ${formatVndWhole(c.approvedTotalVnd ?? null)}${run ? `, by the run on ${formatDate(run)}` : ""}.`;
      return `Approved: ${formatVndWhole(c.approvedTotalVnd ?? null)}.${run ? ` Will be paid by the run on ${formatDate(run)}.` : ""}`;
    }
    case "settled":
      return "Settled against the advance. Nothing more moves on this claim.";
    case "in_run":
      return c.runDate ? `In the ${formatDate(c.runDate)} run – payment on its way.` : "In a payment run – payment on its way.";
    case "paid":
      return `Paid ${formatVndWhole(c.paidVnd ?? null)}${c.paidAt ? ` on ${formatDate(c.paidAt)}` : ""}.`;
  }
}

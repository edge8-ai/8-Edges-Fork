// The words the approvals primitive speaks (S.5). Browser-safe: no data access.
//
// A subject type names what is being approved. It is vocabulary in code, not a
// check constraint, so the next flow that wants approvals adds a word here and
// needs no migration; the primitive treats the id as opaque text because not
// every subject is a row (the assistant's action is a tool call).

import { PERMISSION_ATOM } from "@/kernel/identity/permission-declaration";

export const APPROVAL_STATES = ["pending", "approved", "rejected", "cancelled"] as const;
export type ApprovalState = (typeof APPROVAL_STATES)[number];
export type ApprovalDecision = Exclude<ApprovalState, "pending">;

export const APPROVAL_SUBJECTS = {
  time_off: "Leave request",
  contractor_estimate: "Contractor estimate",
  contractor_work: "Contractor work",
  assistant_action: "Assistant action",
  // The weekly client status is not a word here, on purpose (Z.12.1). It is
  // the account owner's draft on the client's Weekly status page, which they
  // share with the client themselves, so it never waits on anyone. Both of its
  // old words are gone: client_status_page (the library's held pages, Y.65) and
  // client_status_report (Z.12's release). A row still carrying either is
  // historical; waitingOn drops any subject not listed here, so neither can
  // reach the Approvals inbox or the admin home's "Waiting on you".
  agreement_edge8_signature: "Agreement: Edge8 signature",
  agreement_client_signature: "Agreement: client signature",
  // A claim waits on whoever holds a permission, not on a person (RB.3): the
  // check on reimbursements.check, the approval on reimbursements.approve.
  reimbursement_check: "Reimbursement: check",
  reimbursement_approval: "Reimbursement: approval",
  // The two agents' drafts that reach the public (Y.16, Y.17): a post the
  // writer agent parked at ready, and the weekly letter before it sends. Each
  // subject id is the row the agent's run lives on, which is also the row its
  // page opens: for campaign_publish the marketing_campaigns id (writer_step,
  // /revenue/marketing/campaigns/<id>), for letter_send the email_campaigns id
  // of the broadcast (agent_step, /revenue/marketing/broadcasts/<id>).
  campaign_publish: "Writer draft: publish",
  letter_send: "Letter: send",
  // The hiring chain (Z.9), every one addressed to hiring.approve. Subject ids:
  // the requisition (hiring_requisition), the hiring_shortlists row
  // (hiring_shortlist), the candidate_messages row (hiring_message), the
  // application (hiring_hire, hiring_reject). A hire and a rejection are two
  // words because their tiers differ (a hire commits; a rejection reaches one person).
  hiring_requisition: "Hiring: open a requisition",
  hiring_shortlist: "Hiring: shortlist",
  hiring_message: "Hiring: candidate message",
  hiring_reject: "Hiring: reject a candidate",
  hiring_hire: "Hiring: hire a candidate",
  // A proposal the call-to-proposal chain drafted from a sales call (Z.10),
  // before it goes live in the client's portal. The subject id is the
  // proposal_drafts row the chain's run lives on, which is also the row the
  // review page opens (/revenue/proposals/<id>).
  proposal_publish: "Proposal: publish",
  // The follow-up email the meeting-to-actions chain drafted after a client
  // meeting (Z.13). The subject id is the meeting_followups row the run lives
  // on; the meeting page it is decided on comes from metadata.meetingId.
  meeting_followup: "Meeting follow-up: send",
} as const;
export type ApprovalSubject = keyof typeof APPROVAL_SUBJECTS;

/**
 * The subjects the person who asked never decides, so they never wait on that
 * person: nobody checks or approves their own claim (reimbursements design
 * §1.5). The check is addressed to a permission the claimant may hold too, and
 * without this a Finance member's own claim would sit in their "Waiting on
 * you" while their To check list leaves it out. The employer's exemption
 * (`reimbursements.decide-own`) arrives with RB.4, which narrows this rule for
 * its holders.
 */
// A proposed hire waits on another holder of hiring.approve (Z.9, decision 3).
export const NEVER_WAITS_ON_REQUESTER: ReadonlySet<ApprovalSubject> = new Set<ApprovalSubject>(["reimbursement_check", "reimbursement_approval", "hiring_hire"]);

export function isApprovalSubject(value: string): value is ApprovalSubject {
  return value in APPROVAL_SUBJECTS;
}

/**
 * Whether `value` has the shape of a permission atom (`<area>.<name>`, as
 * kernel/identity/permission-declaration declares them). An approval may wait on
 * an atom's holders, and the atom is written into a PostgREST filter, so a
 * string of any other shape is refused rather than spliced into one.
 */
export function isPermissionAtom(value: string): boolean {
  return PERMISSION_ATOM.test(value);
}

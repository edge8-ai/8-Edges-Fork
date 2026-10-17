// The checker, the approver and the payer as the lifecycle module sees them,
// built from the guard's answer by every action that decides or pays a claim,
// on either surface. One module so the Employer's exemption (design §1.6) is
// read the same way everywhere: `mayDecideOwn` is true only for someone who
// holds reimbursements.decide-own, never for holding Admin or Super Admin.
//
// Client-safe: type imports only, so a queue's notice can read the wording.
import type { RequestAccess } from "@/kernel/identity/access-request";
import type { ClaimActor } from "./claim-lifecycle";
import type { ClaimViewer } from "./claim-moves";

type Viewer = Pick<RequestAccess, "personId" | "may" | "user">;

/**
 * What a signed-in person without a person record hears from a queue or an
 * action: the own-claim rule, a claim's history and a payment's record all
 * name a person, so nothing can be checked, approved or paid without one.
 */
export const NO_PERSON_RECORD = "Your sign-in has no person record, so you cannot work on claims here. Ask an admin to link it.";

/** The label a history or audit row names the viewer by: their sign-in address, or nothing. */
export function actorLabel(access: Pick<RequestAccess, "user">): string | null {
  return access.user.email ?? null;
}

/** The decider, or null without a person id: the own-claim rule cannot hold for someone with none. */
export function deciderOf(access: Viewer, kind: "checker" | "approver"): ClaimActor | null {
  if (!access.personId) return null;
  return { kind, personId: access.personId, mayDecideOwn: access.may("reimbursements.decide-own"), label: actorLabel(access) };
}

/** A viewer of someone's claim as movesFor reads them: who they are and which decisions they hold. */
export function claimViewerOf(access: Pick<RequestAccess, "personId" | "may">): ClaimViewer {
  return {
    personId: access.personId,
    mayDecideOwn: access.may("reimbursements.decide-own"),
    mayCheck: access.may("reimbursements.check"),
    mayApprove: access.may("reimbursements.approve"),
  };
}

/**
 * The payer as the lifecycle sees them. No exemption, since paying decides
 * nothing about a claim: the payer may record a payment that includes their
 * own claim, both decisions on it having been made by others.
 */
export function payerOf(access: Pick<RequestAccess, "personId" | "user">): ClaimActor {
  return { kind: "payer", personId: access.personId, mayDecideOwn: false, label: actorLabel(access) };
}

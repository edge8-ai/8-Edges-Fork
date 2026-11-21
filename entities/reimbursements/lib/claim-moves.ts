// What may happen to a claim now, for whoever is looking (A.34). The
// transition table (claim-rules.ts) answers one move at a time; this answers
// "which of the decisions may this viewer make on this claim as it stands",
// once, for the decider's page, the admin page's links and the server's own
// refusals. Before it, the own-claim rule and "is it waiting at my step" were
// worked out again at every one of those places, and a screen and the server
// could disagree.
//
// Two rules live here, both read off the arrows rather than restated:
//   · a claim waits on the checker while the checker's `check` arrow can
//     leave its status, and on the approver while `approve` can;
//   · nobody decides their own claim (design §1.5) unless they hold
//     reimbursements.decide-own (the Employer, §1.6). Paying and the run's
//     cron decide nothing, so the rule does not reach them.
//
// Authorization is not here (ADR 0007): the caller has proved which
// permissions the viewer holds and hands them in. Pure and client-safe.
import { CLAIM_STATUS_TONE, nextClaimStatus, type ClaimActorKind, type ClaimStatus } from "./claim-rules";

/** What a checker or an approver hears on their own claim. */
export const OWN_CLAIM = "You cannot check or approve your own claim.";

/** A claim as these rules read it: where it stands, and whose it is. */
type ClaimFacts = { status: ClaimStatus; personId: string };

/** An actor as the own-claim rule reads them. */
type Actor = { kind: ClaimActorKind; personId: string | null; mayDecideOwn: boolean };

const DECIDERS: ReadonlySet<ClaimActorKind> = new Set<ClaimActorKind>(["checker", "approver"]);

/**
 * Whether the claim waits at this decider's step: the checker's while their
 * `check` arrow can leave its status, the approver's while `approve` can.
 * Everything a decider does at their step (the decision, and for a checker a
 * receipt's decline or its rate) is open exactly then.
 */
export function waitsOn(status: ClaimStatus, kind: "checker" | "approver"): boolean {
  return nextClaimStatus(status, kind === "checker" ? "check" : "approve", kind).outcome === "apply";
}

/**
 * Why this actor may not act on this claim as its owner or its decider, or
 * null when they may. The owner's moves are the owner's alone (a claim that is
 * not yours reads as not found); a checker's or an approver's are never on
 * their own claim unless they may decide their own.
 */
export function ownClaimRefusal(claim: Pick<ClaimFacts, "personId">, actor: Actor): string | null {
  const own = actor.personId !== null && actor.personId === claim.personId;
  if (actor.kind === "owner") return own ? null : "Claim not found.";
  if (DECIDERS.has(actor.kind) && own && !actor.mayDecideOwn) return OWN_CLAIM;
  return null;
}

/** A viewer of someone's claim: their people id (null for a sign-in with none) and what they hold. */
export type ClaimViewer = { personId: string | null; mayDecideOwn: boolean; mayCheck: boolean; mayApprove: boolean };

/** What the viewer may do with the claim now. */
export type ViewerMoves = {
  /** Check, send back or reject at the check, and decline a receipt or enter its rate. */
  check: boolean;
  /** Approve, send back or reject at the approval. */
  approve: boolean;
  /** Have the AI read a receipt again: it decides nothing, so any checker, on any claim. */
  reread: boolean;
  /** The claim waits at a step this viewer's permissions cover, whether or not they may take it. */
  waitsOnViewer: boolean;
  /** It waits on them, and it is their own claim, so someone else decides it. */
  blockedAsOwn: boolean;
};

export function movesFor(claim: ClaimFacts, viewer: ClaimViewer): ViewerMoves {
  const atCheck = viewer.mayCheck && waitsOn(claim.status, "checker");
  const atApproval = viewer.mayApprove && waitsOn(claim.status, "approver");
  // Without a person id the own-claim rule cannot hold, so such a viewer only reads.
  const decides = (kind: "checker" | "approver") =>
    viewer.personId !== null && ownClaimRefusal(claim, { kind, personId: viewer.personId, mayDecideOwn: viewer.mayDecideOwn }) === null;
  const waitsOnViewer = atCheck || atApproval;
  return {
    check: atCheck && decides("checker"),
    approve: atApproval && decides("approver"),
    reread: viewer.mayCheck,
    waitsOnViewer,
    blockedAsOwn: waitsOnViewer && viewer.personId !== null && viewer.personId === claim.personId && !viewer.mayDecideOwn,
  };
}

/**
 * The tone of the line under a claim's title: the status badge's own, so the
 * two never disagree. A notice has no neutral, so a draft reads as info.
 */
export function noticeTone(status: ClaimStatus): "ok" | "warn" | "err" | "info" {
  const tone = CLAIM_STATUS_TONE[status];
  return tone === "neutral" ? "info" : tone;
}

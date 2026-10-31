import { companyOs } from "@/kernel/data/supabase";
import { cancelWorkApprovals, settleWorkApproval } from "./work-approvals";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { workRequestPath } from "@/entities/company-os";
import { runWorkRequestBilling } from "./work-billing";
import { pingOps, sendDecisionEmail } from "./contractor-notify";
import { moveWorkRequest, type WorkRequestResult } from "./work-request-lifecycle";
import { syncContractorCard } from "./contractor-card";
import { type GreetedPerson, GREETING_COLUMNS, greetingName } from "@/kernel/config/people-name";

// Shared state machine for contractor work requests. Since portal clients can
// now originate requests (origin='portal') and decide estimates/work
// themselves, the transitions live here — one status guard, one event write,
// one contractor email per decision — and both the admin actions
// (app/admin/.../contractor-requests/actions.ts) and the portal helpers
// (entities/portal/lib/client-work-requests.ts) call in with their own decider. Auth stays
// with the callers: requireAdmin() on one side, company-scope checks on the
// other. Plan: docs/plans/2026-07-18-client-work-requests.md

// Who is making a decision. `email` is the event's actor and resolves to the
// person on the decision's approval, the one business record of who decided
// (S.5 contract); `assumedBy` is set when an admin acts via portal Assume and is
// stamped on the event meta so the true operator stays recoverable.
export type WorkDecider = {
  actorType: "admin" | "client";
  email: string;
  assumedBy?: string | null;
};

export type LoadedWorkRequest = {
  id: string;
  person_id: string;
  title: string;
  brief: string;
  status: string;
  access_token: string;
  origin: "admin" | "portal";
  client_company_id: string | null;
  requested_by_person_id: string | null;
  person: (GreetedPerson & { email: string }) | null;
};

export async function loadWorkRequest(id: string): Promise<LoadedWorkRequest | null> {
  const { data, error } = await companyOs
    .from("contractor_work_requests")
    .select(
      `id, person_id, title, brief, status, access_token, origin, client_company_id, requested_by_person_id, people!person_id(${GREETING_COLUMNS})`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const people = data.people;
  const person = Array.isArray(people) ? people[0] ?? null : people;
  return { ...(data as Omit<LoadedWorkRequest, "person">), person };
}

function eventMeta(decider: WorkDecider): Record<string, unknown> {
  return decider.assumedBy ? { assumed_by: decider.assumedBy } : {};
}

const contractorUrl = async (req: LoadedWorkRequest) => `${await getSiteOrigin()}${workRequestPath(req.access_token)}`;

// Approve / reject / request changes on a submitted estimate. Every decision
// emails the contractor; "request changes" sends it back for a new estimate.
export async function applyEstimateDecision(
  req: LoadedWorkRequest,
  decision: "approved" | "rejected" | "changes_requested",
  decider: WorkDecider,
  note: string,
): Promise<WorkRequestResult> {
  if (req.status !== "estimate_submitted")
    return { ok: false, error: "Only submitted estimates can be decided." };
  if (decision !== "approved" && !note.trim())
    return { ok: false, error: "Add a note so the contractor knows why." };

  const eventType =
    decision === "approved" ? "approved" : decision === "rejected" ? "rejected" : "info_requested";
  const moved = await moveWorkRequest({
    id: req.id,
    from: req.status,
    to: decision,
    actor: decider.actorType,
    patch: { decided_at: new Date().toISOString() },
    event: {
      actor_type: decider.actorType,
      actor: decider.email,
      type: eventType,
      body: note.trim() || null,
      meta: eventMeta(decider),
    },
  });
  if (!moved.ok) return moved;
  await settleWorkApproval("contractor_estimate", req.id, decision === "approved", decider.email, note);
  if (decision === "rejected") await syncContractorCard(req.id, "not_doing");

  if (req.person?.email) {
    await sendDecisionEmail({
      to: req.person.email,
      name: greetingName(req.person, null),
      title: req.title,
      decision: decision === "changes_requested" ? "info_requested" : decision,
      note,
      url: await contractorUrl(req),
    });
  }

  if (decider.actorType === "client") {
    await pingOps(
      `🧑‍💼 Client ${decision === "approved" ? "approved" : decision === "rejected" ? "declined" : "requested changes on"} the estimate for "${req.title}" (${decider.email}). Review: ${await getSiteOrigin()}/admin/operations/contractor-requests`,
    );
  }

  return { ok: true };
}

// Add scope to an in-progress (approved) request. The extra scope is appended
// to the brief and the request goes back to the contractor to re-estimate —
// same estimate → approve → submit → accept → invoice loop as the original,
// so nothing bills until the finished work is accepted. Both the client (via
// portal) and admins call in here.
export async function applyScopeAddition(
  req: LoadedWorkRequest,
  decider: WorkDecider,
  scope: string,
): Promise<WorkRequestResult> {
  if (req.status !== "approved")
    return { ok: false, error: "Scope can only be added while the work is approved and in progress." };
  const text = scope.trim();
  if (!text) return { ok: false, error: "Describe the extra scope you need." };

  // Append to the brief so the contractor re-estimates against the full,
  // current scope; the event log keeps each addition as its own record.
  const stampedBrief = `${req.brief}\n\n— Added scope —\n${text}`;
  const moved = await moveWorkRequest({
    id: req.id,
    from: req.status,
    to: "scope_added",
    actor: decider.actorType,
    patch: { brief: stampedBrief },
    event: {
      actor_type: decider.actorType,
      actor: decider.email,
      type: "scope_added",
      body: text,
      meta: eventMeta(decider),
    },
  });
  if (!moved.ok) return moved;

  if (req.person?.email) {
    await sendDecisionEmail({
      to: req.person.email,
      name: greetingName(req.person, null),
      title: req.title,
      decision: "scope_added",
      note: text,
      url: await contractorUrl(req),
    });
  }

  if (decider.actorType === "client") {
    await pingOps(
      `🧑‍💼 Client added scope to "${req.title}" (${decider.email}) — contractor to re-estimate. Review: ${await getSiteOrigin()}/admin/operations/contractor-requests?open=${req.id}`,
    );
  }

  return { ok: true };
}

// Accept submitted work (→ completed; portal-origin requests then get billed
// via runWorkRequestBilling) or send it back for revision (→ approved,
// contractor resubmits).
export async function applyWorkDecision(
  req: LoadedWorkRequest,
  decision: "accepted" | "revision",
  decider: WorkDecider,
  note: string,
): Promise<WorkRequestResult> {
  if (req.status !== "work_submitted")
    return { ok: false, error: "Only submitted work can be decided." };
  if (decision === "revision" && !note.trim())
    return { ok: false, error: "Add a note so the contractor knows what to revise." };

  const moved = await moveWorkRequest({
    id: req.id,
    from: req.status,
    to: decision === "accepted" ? "completed" : "approved",
    actor: decider.actorType,
    patch:
      decision === "accepted"
        ? { accepted_at: new Date().toISOString() }
        : {},
    event: {
      actor_type: decider.actorType,
      actor: decider.email,
      type: decision === "accepted" ? "accepted" : "info_requested",
      body: note.trim() || null,
      meta: eventMeta(decider),
    },
  });
  if (!moved.ok) return moved;
  await settleWorkApproval("contractor_work", req.id, decision === "accepted", decider.email, note);
  await syncContractorCard(req.id, decision === "accepted" ? "done" : "open");

  if (req.person?.email) {
    await sendDecisionEmail({
      to: req.person.email,
      name: greetingName(req.person, null),
      title: req.title,
      decision: decision === "accepted" ? "accepted" : "revision_requested",
      note,
      url: await contractorUrl(req),
    });
  }

  if (decider.actorType === "client") {
    await pingOps(
      `🧑‍💼 Client ${decision === "accepted" ? "accepted the work on" : "requested a revision on"} "${req.title}" (${decider.email}). Review: ${await getSiteOrigin()}/admin/operations/contractor-requests`,
    );
  }

  // Billing (QBO invoice at the contractor's billable rate) runs only for
  // portal-origin requests and never blocks the acceptance — every failure
  // path inside degrades to a manual_required/failed flag + accountant email.
  if (decision === "accepted") {
    await runWorkRequestBilling(req.id);
  }

  return { ok: true };
}

export async function applyCancel(
  req: LoadedWorkRequest,
  decider: WorkDecider,
  note: string,
): Promise<WorkRequestResult> {
  if (["rejected", "cancelled", "completed"].includes(req.status))
    return { ok: false, error: "This request is already closed." };

  const moved = await moveWorkRequest({
    id: req.id,
    from: req.status,
    to: "cancelled",
    actor: decider.actorType,
    event: {
      actor_type: decider.actorType,
      actor: decider.email,
      type: "cancelled",
      body: note.trim() || null,
      meta: eventMeta(decider),
    },
  });
  if (!moved.ok) return moved;
  await cancelWorkApprovals(req.id, decider.email);
  await syncContractorCard(req.id, "not_doing");

  if (req.person?.email && req.status !== "draft") {
    await sendDecisionEmail({
      to: req.person.email,
      name: greetingName(req.person, null),
      title: req.title,
      decision: "cancelled",
      note,
      url: await contractorUrl(req),
    });
  }

  if (decider.actorType === "client") {
    await pingOps(
      `🧑‍💼 Client cancelled the work request "${req.title}" (${decider.email}).`,
    );
  }

  return { ok: true };
}

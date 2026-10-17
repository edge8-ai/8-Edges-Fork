"use server";

import { openWorkApproval } from "@/entities/portal/lib/work-approvals";
import { revalidatePath } from "next/cache";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { pingOps, sendClientEstimateReadyEmail } from "@/entities/portal/lib/contractor-notify";
import { moveWorkRequest } from "@/entities/portal/lib/work-request-lifecycle";
import { greetingName, personName } from "@/kernel/config/people-name";
import {
  loadSubmittableRequest,
  parseHours,
  submitContractorWork,
  type SubmitResult,
} from "@/entities/portal/lib/contractor-work-submit";

// Contractor-facing actions on the public /work/[token] page. No admin gate:
// the opaque access_token IS the credential (same bearer-link model as event
// tickets). Every action re-validates the token and the allowed status server
// side, so a stale form can't force an illegal transition.

type Result = SubmitResult;

async function loadByToken(token: string) {
  if (!token || token.length < 8) return null;
  return loadSubmittableRequest({ token });
}

export async function submitEstimate(input: {
  token: string;
  estimatedHours: number;
  plan: string;
  website?: string; // honeypot
}): Promise<Result> {
  if (input.website) return { ok: true }; // bot: pretend success, write nothing

  const req = await loadByToken(input.token);
  if (!req) return { ok: false, error: "This link is not valid." };
  if (!["awaiting_estimate", "changes_requested", "scope_added"].includes(req.status))
    return { ok: false, error: "This request is not open for an estimate right now.", stale: true };

  const hours = parseHours(input.estimatedHours, "Estimated hours");
  if (typeof hours !== "number") return { ok: false, error: hours.error };
  const plan = input.plan?.trim();
  if (!plan) return { ok: false, error: "Describe your plan to complete the work." };

  // Anything other than a first-time estimate (changes requested, or scope
  // added mid-flight) is a re-estimate.
  const resubmit = req.status !== "awaiting_estimate";
  const moved = await moveWorkRequest({
    id: req.id,
    from: req.status,
    to: "estimate_submitted",
    actor: "contractor",
    patch: {
      estimated_hours: hours,
      plan_text: plan,
      estimate_submitted_at: new Date().toISOString(),
    },
    event: {
      actor_type: "contractor",
      actor: req.person?.email ?? null,
      type: resubmit ? "estimate_resubmitted" : "estimate_submitted",
      body: plan,
      meta: { estimated_hours: hours },
    },
    failure: "Something went wrong — please try again.",
    illegal: "Something went wrong — please try again.",
  });
  if (!moved.ok) return moved;
  // The estimate now waits on a decision: it goes on the admins' list (S.5).
  await openWorkApproval("contractor_estimate", { requestId: req.id, title: req.title, contractorName: personName(req.person, "Contractor"), hours });

  await pingOps(
    `📝 Contractor estimate ${resubmit ? "resubmitted" : "submitted"}: "${req.title}" — ${
      personName(req.person, "unknown")
    }, ${hours}h. Review: ${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/admin/operations/contractor-requests`,
  );

  if (req.origin === "portal" && req.requester?.email) {
    await sendClientEstimateReadyEmail({
      to: req.requester.email,
      name: greetingName(req.requester, null),
      title: req.title,
      // Named to the CLIENT, so never by the contractor's email (S.16.8 review).
      contractorName: personName(req.person && { ...req.person, email: null }, null),
      estimatedHours: hours,
      url: `${await getSiteOrigin()}/portal/requests/${req.id}`,
    });
  }

  revalidatePath(`/work/${input.token}`);
  return { ok: true };
}

export async function submitWork(input: {
  token: string;
  actualHours: number;
  overtimeHours: number;
  summary: string;
  link: string;
  website?: string; // honeypot
}): Promise<Result> {
  if (input.website) return { ok: true };

  const req = await loadByToken(input.token);
  if (!req) return { ok: false, error: "This link is not valid." };
  const submitted = await submitContractorWork(req, input);
  if (!submitted.ok) return submitted;

  revalidatePath(`/work/${input.token}`);
  return { ok: true };
}

import { openWorkApproval } from "./work-approvals";
import { companyOs } from "@/kernel/data/supabase";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { pingOps, sendClientWorkReadyEmail } from "./contractor-notify";
import { one } from "@/kernel/config/embedded";
import { moveWorkRequest } from "./work-request-lifecycle";
import { parseLinkInput } from "@/kernel/ui/url";
import { type GreetedPerson, GREETING_COLUMNS, greetingName, personName } from "@/kernel/config/people-name";

// The contractor handing in finished work, from either door they have to it:
// the login-less /work/[token] page, or dragging the request's card to Done on
// the Contractors board. Both land here so the hours, the approval, the ops
// ping and the client's email cannot drift apart. Auth stays with the callers:
// the bearer token on one side, the card's assignee on the other.

// `stale` marks the case where the input is fine but the request has already
// moved past this step (e.g. a tab left open on the estimate screen after the
// estimate was approved). The token page uses it to refresh into the current
// state instead of showing a dead-end error.
export type SubmitResult = { ok: true } | { ok: false; error: string; stale?: boolean };

type Requester = GreetedPerson & { email: string };

export type SubmittableRequest = {
  id: string;
  title: string;
  status: string;
  origin: string;
  person_id: string;
  person: Requester | null;
  requester: Requester | null;
};

export async function loadSubmittableRequest(by: { token: string } | { id: string }): Promise<SubmittableRequest | null> {
  const query = companyOs
    .from("contractor_work_requests")
    // Two people FKs on this table now — every embed needs an explicit hint.
    .select(
      `id, title, status, origin, person_id, people!person_id(${GREETING_COLUMNS}), requester:people!requested_by_person_id(${GREETING_COLUMNS})`,
    );
  const { data, error } = await ("token" in by ? query.eq("access_token", by.token) : query.eq("id", by.id)).maybeSingle();
  if (error || !data) return null;
  const person = one(data.people as Requester | Requester[] | null);
  const requester = one(data.requester as Requester | Requester[] | null);
  return { ...(data as Omit<SubmittableRequest, "person" | "requester">), person, requester };
}

export function parseHours(v: unknown, label: string, { allowZero = false } = {}): number | { error: string } {
  const n = Number(v);
  if (!Number.isFinite(n)) return { error: `${label} must be a number.` };
  if (n < 0 || (!allowZero && n <= 0)) return { error: `${label} must be greater than zero.` };
  if (n > 1000) return { error: `${label} looks too large.` };
  return Math.round(n * 100) / 100;
}

export type WorkSubmission = {
  actualHours: number;
  overtimeHours: number;
  summary: string;
  link: string;
};

export async function submitContractorWork(req: SubmittableRequest, input: WorkSubmission): Promise<SubmitResult> {
  if (req.status !== "approved")
    return { ok: false, error: "This request is not open for a work submission right now.", stale: true };

  const hours = parseHours(input.actualHours, "Actual hours");
  if (typeof hours !== "number") return { ok: false, error: hours.error };
  const overtime = parseHours(input.overtimeHours ?? 0, "Overtime hours", { allowZero: true });
  if (typeof overtime !== "number") return { ok: false, error: overtime.error };
  const summary = input.summary?.trim();
  if (!summary) return { ok: false, error: "Describe the work you did." };
  const link = parseLinkInput(input.link);
  if (!link.ok) return { ok: false, error: "The supporting link isn't a web link. Paste its full address." };

  const moved = await moveWorkRequest({
    id: req.id,
    from: req.status,
    to: "work_submitted",
    actor: "contractor",
    patch: {
      actual_hours: hours,
      actual_overtime_hours: overtime,
      work_summary: summary,
      work_link: link.value,
      work_submitted_at: new Date().toISOString(),
    },
    event: {
      actor_type: "contractor",
      actor: req.person?.email ?? null,
      type: "work_submitted",
      body: summary,
      meta: { actual_hours: hours, overtime_hours: overtime, link },
    },
    failure: "Something went wrong — please try again.",
    illegal: "Something went wrong — please try again.",
  });
  if (!moved.ok) return moved;
  await openWorkApproval("contractor_work", { requestId: req.id, title: req.title, contractorName: personName(req.person, "Contractor"), hours });

  await pingOps(
    `✅ Contractor work submitted: "${req.title}" — ${
      personName(req.person, "unknown")
    }, ${hours}h${overtime > 0 ? ` + ${overtime}h OT` : ""}. Review: ${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/admin/operations/contractor-requests`,
  );

  if (req.origin === "portal" && req.requester?.email) {
    await sendClientWorkReadyEmail({
      to: req.requester.email,
      name: greetingName(req.requester, null),
      title: req.title,
      // Named to the CLIENT, so never by the contractor's email (S.16.8 review).
      contractorName: personName(req.person && { ...req.person, email: null }, null),
      url: `${await getSiteOrigin()}/portal/requests/${req.id}`,
    });
  }

  return { ok: true };
}

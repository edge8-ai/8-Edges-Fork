"use server";

import { revalidatePath } from "next/cache";
import { companyOs } from "@/kernel/data/supabase";
import { GREETING_COLUMNS, greetingName } from "@/kernel/config/people-name";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { newTicketCode } from "@/entities/retreats";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { workRequestPath } from "@/entities/company-os/lib/contractors";
import { sendWorkRequestEmail } from "@/entities/portal";
import {
  addWorkEvent,
  applyCancel,
  applyEstimateDecision,
  applyScopeAddition,
  applyWorkDecision,
  loadWorkRequest,
} from "@/entities/portal";
import type { RequestEventRow } from "./request-shared";
import { insertContractorWorkRequests, moveWorkRequest, openContractorCard } from "@/entities/portal";
import type { Result } from "@/kernel/data/result";

function refresh() {
  revalidatePath("/admin/operations/contractor-requests");
}

// Create a work request and (by default) send it straight to the contractor.
export async function createWorkRequest(input: {
  personId: string;
  title: string;
  brief: string;
  send?: boolean;
}): Promise<Result & { id?: string }> {
  const { user: admin } = await requirePermission("company-os.operations");

  const title = input.title?.trim();
  const brief = input.brief?.trim();
  if (!input.personId) return { ok: false, error: "Pick a contractor." };
  if (!title) return { ok: false, error: "Title is required." };
  if (!brief) return { ok: false, error: "Brief is required." };

  // Confirm the person is an active contract team member.
  const { data: tm, error: tmErr } = await companyOs
    .from("team_members")
    .select("id, status, employment_type")
    .eq("person_id", input.personId)
    .maybeSingle();
  if (tmErr) return { ok: false, error: tmErr.message };
  if (!tm || tm.employment_type !== "contract" || tm.status !== "active") {
    return { ok: false, error: "That person is not an active contractor." };
  }

  const send = input.send !== false;
  const row = {
    person_id: input.personId,
    title,
    brief,
    access_token: newTicketCode(16),
    status: send ? "awaiting_estimate" : "draft",
    created_by: admin.email,
  };
  const { data, error } = await insertContractorWorkRequests(row)
    .select("id, access_token")
    .single();
  if (error) return { ok: false, error: error.message };

  await addWorkEvent(data.id, { actor_type: "admin", actor: admin.email, type: "created", body: brief });
  await recordAudit({
    table: "contractor_work_requests",
    recordId: data.id,
    operation: "insert",
    actor: admin.email,
    newData: { person_id: input.personId, title, status: row.status },
  });

  if (send) {
    await openContractorCard({ id: data.id, title, brief, person_id: input.personId });
    // The request row already exists; a failed contact lookup only costs the
    // notification email, so it is logged rather than failing the action.
    const { data: person, error: personErr } = await companyOs
      .from("people")
      .select(GREETING_COLUMNS)
      .eq("id", input.personId)
      .maybeSingle();
    if (personErr) {
      console.error("[contractor-requests] person lookup failed:", personErr.message);
    }
    if (person?.email) {
      await sendWorkRequestEmail({
        to: person.email,
        // "Hi …" in the email: see greetingName (S.16).
        name: greetingName(person, null),
        title,
        brief,
        url: `${await getSiteOrigin()}${workRequestPath(data.access_token)}`,
      });
    }
  }

  refresh();
  return { ok: true, id: data.id };
}

// Send (or resend) the request email. Draft → awaiting_estimate.
export async function sendWorkRequest(id: string): Promise<Result> {
  await requirePermission("company-os.operations");
  const req = await loadWorkRequest(id);
  if (!req) return { ok: false, error: "Request not found." };
  if (["rejected", "cancelled", "completed"].includes(req.status))
    return { ok: false, error: "This request is closed." };

  // Sending a draft is the one status move that leaves no timeline row of its
  // own: the contractor's email is the record, and that stayed as it was.
  if (req.status === "draft") {
    const moved = await moveWorkRequest({
      id,
      from: req.status,
      to: "awaiting_estimate",
      actor: "admin",
    });
    if (!moved.ok) return moved;
  }
  // Idempotent, so a resend also opens the card of a request sent before the
  // Contractors board existed.
  await openContractorCard(req);

  if (!req.person?.email) return { ok: false, error: "Contractor has no email on file." };
  const sent = await sendWorkRequestEmail({
    to: req.person.email,
    name: greetingName(req.person, null),
    title: req.title,
    brief: "",
    url: `${await getSiteOrigin()}${workRequestPath(req.access_token)}`,
  });
  if (!sent) return { ok: false, error: "Email send failed (check RESEND_API_KEY)." };

  refresh();
  return { ok: true };
}

// Approve / reject / request changes on a submitted estimate. Transition
// logic (guards, event, contractor email) lives in the portal entity's
// work-requests.ts, shared with the portal's client-driven decisions.
export async function decideEstimate(
  id: string,
  decision: "approved" | "rejected" | "changes_requested",
  note: string,
): Promise<Result> {
  const { user: admin } = await requirePermission("company-os.operations");
  const req = await loadWorkRequest(id);
  if (!req) return { ok: false, error: "Request not found." };

  const r = await applyEstimateDecision(req, decision, { actorType: "admin", email: admin.email }, note);
  if (!r.ok) return r;

  await recordAudit({
    table: "contractor_work_requests",
    recordId: id,
    operation: "update",
    actor: admin.email,
    newData: { status: decision, note: note.trim() || null },
  });

  refresh();
  return { ok: true };
}

// Accept submitted work (→ completed, payable at month end; portal-origin
// requests also get client-billed) or send it back for revision (→ approved,
// contractor resubmits).
export async function decideWork(id: string, decision: "accepted" | "revision", note: string): Promise<Result> {
  const { user: admin } = await requirePermission("company-os.operations");
  const req = await loadWorkRequest(id);
  if (!req) return { ok: false, error: "Request not found." };

  const r = await applyWorkDecision(req, decision, { actorType: "admin", email: admin.email }, note);
  if (!r.ok) return r;

  await recordAudit({
    table: "contractor_work_requests",
    recordId: id,
    operation: "update",
    actor: admin.email,
    newData: { status: decision === "accepted" ? "completed" : "approved", note: note.trim() || null },
  });

  refresh();
  return { ok: true };
}

// Add scope to an approved, in-progress request — sends it back to the
// contractor to re-estimate (shared state machine in the portal entity).
export async function addScope(id: string, scope: string): Promise<Result> {
  const { user: admin } = await requirePermission("company-os.operations");
  const req = await loadWorkRequest(id);
  if (!req) return { ok: false, error: "Request not found." };

  const r = await applyScopeAddition(req, { actorType: "admin", email: admin.email }, scope);
  if (!r.ok) return r;

  await recordAudit({
    table: "contractor_work_requests",
    recordId: id,
    operation: "update",
    actor: admin.email,
    newData: { status: "scope_added", scope: scope.trim() },
  });

  refresh();
  return { ok: true };
}

export async function cancelWorkRequest(id: string, note: string): Promise<Result> {
  const { user: admin } = await requirePermission("company-os.operations");
  const req = await loadWorkRequest(id);
  if (!req) return { ok: false, error: "Request not found." };

  const r = await applyCancel(req, { actorType: "admin", email: admin.email }, note);
  if (!r.ok) return r;

  await recordAudit({
    table: "contractor_work_requests",
    recordId: id,
    operation: "update",
    actor: admin.email,
    newData: { status: "cancelled" },
  });

  refresh();
  return { ok: true };
}

// Timeline for the shelf (lazy-loaded on open).
export async function listRequestEvents(requestId: string): Promise<RequestEventRow[]> {
  await requirePermission("company-os.operations");
  const { data, error } = await companyOs
    .from("contractor_work_events")
    .select("id, actor_type, actor, type, body, meta, created_at")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[contractor-requests] events load failed:", error.message);
    return [];
  }
  return (data ?? []) as RequestEventRow[];
}

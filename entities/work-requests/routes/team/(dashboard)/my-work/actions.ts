"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { recordAudit } from "@/kernel/audit/audit";
import { newTicketCode } from "@/kernel/config/ticket-code";
import type { Result } from "@/kernel/data/result";
import { boardsForContractorCard, openContractorCard } from "../../../../lib/contractor-card";
import { parseHours } from "../../../../lib/contractor-work-submit";
import { addWorkEvent } from "../../../../lib/work-request-lifecycle";
import { openWorkApproval } from "../../../../lib/work-approvals";
import { pingOps } from "../../../../lib/contractor-notify";
import { openWorkRequestRow } from "../../../../lib/work-request-records";

// A contractor proposing work themselves (Dave, 2026-11-16), so a request no
// longer has to start with an admin. It goes in with the contractor's estimate
// already on it, as estimate_submitted, and from there it is any other
// request: an admin approves, rejects or asks for changes on the Work Requests
// page, and the contractor reports hours by dragging the card to Done. The
// origin stays 'admin' (Edge8's own work, never billed to a client); the
// "created" event and created_by name the contractor.
export async function proposeWorkRequest(input: {
  title: string;
  brief: string;
  estimatedHours: number;
  boardId: string;
}): Promise<Result> {
  await requirePermission("work-requests.contractor-work");
  const actor = await requireTeamMember();
  if (actor.employmentType !== "contract") return { ok: false, error: "Only contractors can propose work here." };

  const title = input.title?.trim();
  const brief = input.brief?.trim();
  if (!title) return { ok: false, error: "Title is required." };
  if (!brief) return { ok: false, error: "Describe the work and your plan." };
  const hours = parseHours(input.estimatedHours, "Estimated hours");
  if (typeof hours !== "number") return { ok: false, error: hours.error };
  const boards = await boardsForContractorCard(actor.personId, actor.teamMemberId);
  const board = boards.find((b) => b.id === input.boardId);
  if (!board) return { ok: false, error: "Pick one of your boards." };

  const { data, error } = await openWorkRequestRow({
    person_id: actor.personId,
    title,
    brief,
    access_token: newTicketCode(16),
    status: "estimate_submitted",
    estimated_hours: hours,
    plan_text: brief,
    estimate_submitted_at: new Date().toISOString(),
    created_by: actor.email,
  });
  if (error) return { ok: false, error: error.message };

  await addWorkEvent(data.id, { actor_type: "contractor", actor: actor.email, type: "created", body: brief });
  await addWorkEvent(data.id, {
    actor_type: "contractor",
    actor: actor.email,
    type: "estimate_submitted",
    body: brief,
    meta: { estimated_hours: hours },
  });
  await recordAudit({
    table: "contractor_work_requests",
    recordId: data.id,
    operation: "insert",
    actor: actor.email,
    newData: { person_id: actor.personId, title, status: "estimate_submitted", estimated_hours: hours, proposed_by: "contractor" },
  });
  // The estimate waits on a decision: it goes on the admins' list (S.5).
  await openWorkApproval("contractor_estimate", { requestId: data.id, title, contractorName: actor.name, hours });
  await openContractorCard({ id: data.id, title, brief, person_id: actor.personId }, board.id);
  await pingOps(
    `🆕 Contractor proposed work: "${title}" — ${actor.name}, ${hours}h. Review: ${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/admin/operations/contractor-requests`,
  );

  revalidatePath("/team/my-work");
  return { ok: true };
}

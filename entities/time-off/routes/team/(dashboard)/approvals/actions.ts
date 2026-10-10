"use server";

// The team hub's approval decisions (S.5). Guards first (ADR 0007); the leave
// rules and the two checks live in decideLeaveAsManager, which refuses anyone
// the approver resolver does not name for the request.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import type { Result } from "@/kernel/data/result";
import { decideLeaveAsManager } from "@/entities/time-off/lib/manager-decisions";

const Decision = z.object({ id: z.string().uuid(), decision: z.enum(["approved", "rejected"]) });

export async function decideLeaveRequest(id: unknown, decision: unknown): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const parsed = Decision.safeParse({ id, decision });
  if (!parsed.success) return { ok: false, error: "That is not a leave decision." };
  const result = await decideLeaveAsManager(actor, parsed.data.id, parsed.data.decision);
  if (result.ok) revalidatePath("/team/approvals");
  return result;
}

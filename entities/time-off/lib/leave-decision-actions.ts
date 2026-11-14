"use server";

// Deciding a leave request from the team Inbox's Decisions (TH.11, before that
// the /team/approvals page, S.5). It lives in lib/ because shared UI calls it:
// the Decisions section is time-off's, drawn inside the notifications Inbox
// through a page slot. Guard first (ADR 0007); the leave rules and the two
// checks live in decideLeaveAsManager, which refuses anyone the approver
// resolver does not name for the request.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import type { Result } from "@/kernel/data/result";
import { decideLeaveAsManager } from "./manager-decisions";

const Decision = z.object({ id: z.string().uuid(), decision: z.enum(["approved", "rejected"]) });

export async function decideLeaveRequest(id: unknown, decision: unknown): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const parsed = Decision.safeParse({ id, decision });
  if (!parsed.success) return { ok: false, error: "That is not a leave decision." };
  const result = await decideLeaveAsManager(actor, parsed.data.id, parsed.data.decision);
  if (result.ok) revalidatePath("/team/inbox");
  return result;
}

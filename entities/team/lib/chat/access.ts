// Server-only. What the team assistant may show one employee about clients
// (2026-10-02). The rules:
//   - everyone sees company-wide totals, counts, business names and deals;
//   - an employee placed at a client (an active staff_assignments row) sees that
//     client's money and contact people;
//   - an employee who may see every client (crm's seesEveryClient: whoever may
//     work the pipeline, which the Revenue and Admin roles hold, ADR 0013) sees
//     every client's money and contact people.
// The two grants add together. The route resolves this once per request from
// the session's TeamActor and access, never from anything the model or the
// client sent, and hands it to every tool body, which is where the rules are
// enforced.

import { mustRows } from "@/kernel/data/read";
import type { Access } from "@/kernel/identity/access-model";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { selectStaffAssignments } from "@/entities/contacts";
import { seesEveryClient } from "@/entities/crm";

export type ChatAccess = {
  hasRevenueAccess: boolean;
  /** company_os.companies ids the employee is actively placed at. */
  assignedClientIds: string[];
};

export async function resolveChatAccess(
  actor: Pick<TeamActor, "teamMemberId">,
  access: Pick<Access, "may">,
): Promise<ChatAccess> {
  // mustRows: a failed read must not pass as "assigned nowhere", which would
  // look like a working assistant quietly refusing the person's own client.
  const rows = mustRows(
    await selectStaffAssignments("company_id")
      .eq("team_member_id", actor.teamMemberId)
      .eq("status", "active"),
    "[team/chat] staff_assignments",
  ) as { company_id: string }[];
  return {
    hasRevenueAccess: seesEveryClient(access),
    assignedClientIds: [...new Set(rows.map((r) => r.company_id))],
  };
}

/** Whether this employee may see one client's money and contact people. */
export function canSeeClient(access: ChatAccess, companyId: string): boolean {
  return access.hasRevenueAccess || access.assignedClientIds.includes(companyId);
}

/** Whether any per-client tool is worth offering this employee at all. */
export function seesAnyClient(access: ChatAccess): boolean {
  return access.hasRevenueAccess || access.assignedClientIds.length > 0;
}

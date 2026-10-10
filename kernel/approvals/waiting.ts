// The one reader of company_os.approvals (S.5): what is waiting on a person.
//
// An approval waits on the person its flow named, on whoever holds the
// permission its flow named (RB.3: a claim waits on its checkers, not on one
// of them), or, when the flow named neither (no manager could be resolved, or a
// request made before approvals existed), on the admins. So an admin's list is
// theirs, their permissions' and the unassigned; a team member's is theirs and
// their permissions'. A row addressed to a permission is not unassigned: it
// would otherwise fall to every admin, whether or not they hold it. A subject
// its requester never decides (a claim's check or approval) is left out of the
// requester's own list. A failed read raises: an empty list here says "nothing
// needs you", and that must never be what a database hiccup says.
import { companyOs } from "@/kernel/data/supabase";
import { mustCount, mustRows } from "@/kernel/data/read";
import { NEVER_WAITS_ON_REQUESTER, isApprovalSubject, isPermissionAtom, type ApprovalSubject } from "./vocabulary";

export type WaitingApproval = {
  id: string;
  subjectType: ApprovalSubject;
  subjectId: string;
  label: string;
  requestedBy: string | null;
  /** Whom it waits on: the person its flow named, or else the permission; neither means the admins. */
  approverPersonId: string | null;
  approverPermission: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
};

/**
 * What waits on this person. `permissions` are the atoms the person holds, from
 * the access the caller already resolved (`access.permissions()`); the kernel
 * does not resolve them again here. A caller that only reads approvals no
 * permission is ever named on may pass none, and says why.
 */
export async function waitingOn(
  personId: string | null,
  { admin, permissions }: { admin: boolean; permissions: readonly string[] },
): Promise<WaitingApproval[]> {
  const addressed: string[] = [];
  if (personId) addressed.push(`approver_person_id.eq.${personId}`);
  // Quoted, because an atom's dot is reserved inside a PostgREST list.
  const atoms = permissions.filter(isPermissionAtom);
  if (atoms.length > 0) addressed.push(`approver_permission.in.(${atoms.map((a) => `"${a}"`).join(",")})`);
  if (admin) addressed.push("and(approver_person_id.is.null,approver_permission.is.null)");
  if (addressed.length === 0) return [];
  const query = companyOs
    .from("approvals")
    .select("id, subject_type, subject_id, requested_by, approver_person_id, approver_permission, metadata, created_at")
    .eq("state", "pending")
    .or(addressed.join(","));
  const rows = mustRows(await query.order("created_at", { ascending: true }).limit(200), "[approvals] waiting");
  return rows.flatMap((r) => {
    if (!isApprovalSubject(r.subject_type)) return [];
    // A subject its requester never decides is not waiting on them, whichever
    // way it is addressed, so every list that reads this agrees (vocabulary).
    if (personId && r.requested_by === personId && NEVER_WAITS_ON_REQUESTER.has(r.subject_type)) return [];
    const metadata = (r.metadata ?? {}) as Record<string, unknown>;
    return [
      {
        id: r.id,
        subjectType: r.subject_type,
        subjectId: r.subject_id,
        label: typeof metadata.label === "string" ? metadata.label : r.subject_type,
        requestedBy: r.requested_by,
        approverPersonId: r.approver_person_id ?? null,
        approverPermission: r.approver_permission ?? null,
        createdAt: r.created_at,
        metadata,
      },
    ];
  });
}

export type SubjectApproval = {
  id: string;
  state: string;
  metadata: Record<string, unknown>;
  decidedBy: string | null;
  decidedAt: string | null;
};

/**
 * A subject's answer: its latest approval row, pending or decided, or null
 * when it has none (A.30.1: a subject's answer is its latest row). For a flow
 * that resumes on the decision (the writer's publish, the letter's send, Y.16
 * and Y.17), so the step that acts reads the row itself rather than trust the
 * state a button left. A failed read raises: "no approval" must never be what
 * a database hiccup says, because the flow would then ask again or act.
 */
export async function latestApproval(subjectType: ApprovalSubject, subjectId: string): Promise<SubjectApproval | null> {
  const rows = mustRows(
    await companyOs
      .from("approvals")
      .select("id, state, metadata, decided_by, decided_at")
      .eq("subject_type", subjectType)
      .eq("subject_id", subjectId)
      .order("created_at", { ascending: false })
      .limit(1),
    "[approvals] latest",
  );
  const r = rows[0];
  if (!r) return null;
  return { id: r.id, state: r.state, metadata: (r.metadata ?? {}) as Record<string, unknown>, decidedBy: r.decided_by, decidedAt: r.decided_at };
}

/**
 * Whether anything waits on this person's own decision: the fact the Approver
 * role follows (ADR 0013), which holds time-off.approve for them. It reads the
 * person column only. A request addressed to a
 * permission waits on its holders, and holding a module permission
 * (reimbursements.check) must not make anyone an Approver of leave. A failed
 * read raises, so the resolver refuses rather than drops the role.
 */
export async function hasWaitingOn(personId: string): Promise<boolean> {
  const count = mustCount(
    await companyOs
      .from("approvals")
      .select("id", { count: "exact", head: true })
      .eq("state", "pending")
      .eq("approver_person_id", personId),
    "[approvals] waiting count",
  );
  return count > 0;
}

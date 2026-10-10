import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { companyOs } from "@/kernel/data/supabase";
import { PageHead } from "@/kernel/ui/PageHead";
import { PoliciesTable, type PolicyRow } from "./PoliciesTable";

export const metadata = {
  title: "Time Off — Policies",
  description: "Leave policies and their approval mode.",
};

// Operations → Time Off → Policies. One row per leave policy: who's on it and
// whether requests auto-approve at submission (Edge8 Core Team) or wait for a
// decision on the Requests board (On Target). The toggle is the single control
// for that behavior — no code change needed when a policy switches mode.

type PolicyDbRow = { id: string; name: string | null; auto_approve: boolean };
type MemberDbRow = { leave_policy_id: string | null };

export default async function LeavePoliciesPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("time-off.manage");
  const [polRes, tmRes] = await Promise.all([
    companyOs.from("leave_policies").select("id, name, auto_approve").order("name"),
    companyOs.from("team_members").select("leave_policy_id").eq("status", "active"),
  ]);

  const memberRows = (tmRes.data ?? []) as MemberDbRow[];
  const countByPolicy = new Map<string, number>();
  let unassigned = 0;
  for (const m of memberRows) {
    if (m.leave_policy_id) {
      countByPolicy.set(m.leave_policy_id, (countByPolicy.get(m.leave_policy_id) ?? 0) + 1);
    } else {
      unassigned += 1;
    }
  }

  const rows: PolicyRow[] = ((polRes.data ?? []) as PolicyDbRow[]).map((p) => ({
    id: p.id,
    name: p.name ?? "Unnamed policy",
    autoApprove: p.auto_approve,
    activeMembers: countByPolicy.get(p.id) ?? 0,
  }));

  const error = polRes.error?.message ?? tmRes.error?.message ?? null;

  return (
    <>
      <PageHead
        eyebrow="Operations · Time Off"
        title="Policies"
        sub="Open a policy for its rules, its text and where each member stands. The switch sets whether time off auto-approves or waits for a decision."
        action={
          <Link href="/admin/operations/time-off/requests" className="admin-btn">
            Back to Requests
          </Link>
        }
      />

      {error && <div className="admin-alert admin-alert--err">{error}</div>}

      <PoliciesTable rows={rows} />

      {unassigned > 0 && (
        <p className="admin-cell-muted u-mt-3">
          {unassigned} active team member{unassigned === 1 ? "" : "s"} with no leave policy —
          their requests need manual approval. Assign policies on the team member profile.
        </p>
      )}
    </>
  );
}

import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { notFound } from "next/navigation";
import { companyOs } from "@/kernel/data/supabase";
import { PageHead } from "@/kernel/ui/PageHead";
import { formatDate } from "@/kernel/ui/format";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";
import { PolicyCard, formatNumber, getLeavePolicy, getMemberLeave, hoursToDays } from "@/entities/time-off";
import { PolicyEditor } from "./PolicyEditor";

export const metadata = {
  title: "Time Off — Policy",
  description: "One leave policy: its rules, its text, and where each member stands.",
};

// Operations → Time Off → Policies → one policy. The card at the top is the
// same component the employee and the client see, so what an admin edits here
// is exactly what they read there. Below it, every active member on the policy
// with their computed balance, then the editor.
type MemberDbRow = {
  id: string;
  people: NamedPerson | NamedPerson[] | null;
};

const muted = <span className="admin-cell-muted">—</span>;

export default async function LeavePolicyDetailPage(props: { params: Promise<{ id: string }> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("time-off.manage");
  const params = await props.params;
  const policy = await getLeavePolicy(params.id);
  if (!policy) notFound();

  const { data: memberRows, error } = await companyOs
    .from("team_members")
    .select(`id, people(${NAME_COLUMNS})`)
    .eq("leave_policy_id", policy.id)
    .eq("status", "active");
  if (error) console.error("[time-off] team_members read failed:", error.message);

  const members = ((memberRows ?? []) as unknown as MemberDbRow[]).map((m) => ({
    id: m.id,
    name: personName(Array.isArray(m.people) ? m.people[0] : m.people, "Team member"),
  }));
  members.sort((a, b) => a.name.localeCompare(b.name));
  const leave = await getMemberLeave(members.map((m) => m.id));
  const hpd = policy.accrual.hoursPerDay;
  const days = (h: number) => formatNumber(hoursToDays(h, hpd));

  return (
    <>
      <PageHead
        eyebrow="Operations · Time Off · Policies"
        title={policy.name}
        sub={`${members.length} active member${members.length === 1 ? "" : "s"}. Balances are computed from these rules and each member's approved leave.`}
        action={
          <Link href="/admin/operations/time-off/policies" className="admin-btn">
            Back to Policies
          </Link>
        }
      />

      <PolicyCard policy={policy} />

      <div className="admin-card admin-section-card u-mt-4">
        <h2 className="admin-card-title">Members</h2>
        {members.length === 0 ? (
          <div className="admin-empty">No active team members on this policy.</div>
        ) : (
          <div className="admin-table-wrap admin-table-wrap--flat">
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Counted from</th>
                    <th>Year</th>
                    <th>Rate</th>
                    <th>Accrued</th>
                    <th>Used</th>
                    <th>Available</th>
                    <th>Next step-up</th>
                    <th>At risk</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => {
                    const l = leave.get(m.id);
                    const b = l?.balance ?? null;
                    return (
                      <tr key={m.id}>
                        <td>
                          <Link href={`/admin/talent/team/${m.id}`} className="admin-cell-strong u-link-plain">
                            {m.name}
                          </Link>
                        </td>
                        <td>{l?.anniversaryDate ? formatDate(l.anniversaryDate) : muted}</td>
                        <td>{b ? b.serviceYear : muted}</td>
                        <td>{b?.tier ? `${days(b.tier.hoursPerYear)} d/yr` : muted}</td>
                        <td className="admin-cell-mono">{b ? `${days(b.accruedHours + b.anchorHours + b.adjustedHours)} d` : muted}</td>
                        <td className="admin-cell-mono">{b ? `${days(b.usedHours)} d` : muted}</td>
                        <td className="admin-cell-mono">
                          {b ? (
                            <span className={b.remainingHours < 0 ? "u-warn" : undefined}>
                              {days(b.remainingHours)} d
                              <span className="admin-cell-muted"> ({formatNumber(b.remainingHours)} h)</span>
                            </span>
                          ) : (
                            muted
                          )}
                        </td>
                        <td>
                          {b?.nextStepUp
                            ? `${formatDate(b.nextStepUp.date)} → ${days(b.nextStepUp.hoursPerYear)} d/yr`
                            : muted}
                        </td>
                        <td className="admin-cell-mono">
                          {b?.nextCapCheck && b.nextCapCheck.atRiskHours > 0 ? (
                            <span className="u-warn">
                              {days(b.nextCapCheck.atRiskHours)} d by {formatDate(b.nextCapCheck.date)}
                            </span>
                          ) : (
                            muted
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="admin-card admin-section-card u-mt-4">
        <h2 className="admin-card-title">Edit policy</h2>
        <PolicyEditor policy={policy} />
      </div>
    </>
  );
}

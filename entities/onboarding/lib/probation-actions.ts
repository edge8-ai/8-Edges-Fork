"use server";
// Decide a probation from Admin (AH.5): Admin Home's Pass, Extend 30 days and
// Not continuing on a probation that ends today. The Team surface records the
// same decision from /team/probation/[id], allowing the person's manager, an
// admin, or the talent director; on Admin the check is onboarding.manage, held
// by Admin by default. Whoever is given it in Settings → Access may decide
// anyone's probation from Home, which its sentence in permissions.ts says. The decision
// is applied by the same core (applyProbationDecision), which records it once
// and refuses a person who is no longer on probation.
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/kernel/identity/access-request";
import { teamSelfOf } from "@/kernel/identity/team-people";
import type { Result } from "@/kernel/data/result";
import { applyProbationDecision } from "./probation-decision";
import type { CycleDecision } from "./cycle";

const DECISIONS: readonly CycleDecision[] = ["offer_full_time", "extend_probation_30", "terminate"];

/** Record one probation decision for `subjectTeamMemberId`, by an admin. */
export async function decideProbation(subjectTeamMemberId: string, decision: CycleDecision): Promise<Result> {
  const access = await requirePermission("onboarding.manage");
  if (!DECISIONS.includes(decision)) return { ok: false, error: "Unknown decision." };
  if (typeof subjectTeamMemberId !== "string" || !subjectTeamMemberId) return { ok: false, error: "Team member not found." };
  // Who decided is a team member when the admin is one; an admin with no
  // membership (the bootstrap allowlist) is still recorded by email.
  const self = access.personId ? await teamSelfOf(access.personId) : null;
  const res = await applyProbationDecision({ subjectTeamMemberId, decision, decidedByTmId: self?.teamMemberId ?? null, actorEmail: access.user.email });
  if (!res.ok) return res;
  revalidatePath("/admin");
  revalidatePath("/admin/talent/onboarding");
  return { ok: true };
}

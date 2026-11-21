import { companyOs } from "@/kernel/data/supabase";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { reassign } from "@/entities/coaching/lib/stack-order";
import { one } from "@/kernel/config/embedded";
import type { Result } from "./shared";

// The member's own stack, after a drag inside a column (K.66). Every id has to
// belong to this member's own profile: one that does not fails the whole write
// rather than reordering a stranger's card alongside their own.
export async function myReorderCommitments(actor: TeamActor, orderedIds: string[]): Promise<Result> {
  const ids = orderedIds.filter(Boolean);
  if (ids.length < 2) return { ok: true };
  const { data, error: dataError } = await companyOs
    .from("coaching_commitments")
    .select("id, sort_order, coaching_profiles:coaching_profiles!coaching_profile_id(team_member_id)")
    .in("id", ids);
  if (dataError) {
    console.error("[team/coaching/member] coaching_commitments", dataError);
    return { ok: false, error: "Could not save the order." };
  }
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  if (rows.length !== ids.length) return { ok: false, error: "Not found." };
  const held: { id: string; sortOrder: number }[] = [];
  for (const r of rows) {
    const prof = one(r.coaching_profiles as { team_member_id: string } | { team_member_id: string }[] | null);
    if (prof?.team_member_id !== actor.teamMemberId) return { ok: false, error: "Not found." };
    held.push({ id: r.id as string, sortOrder: (r.sort_order as number | null) ?? 0 });
  }
  for (const next of reassign(ids, held)) {
    const { error } = await companyOs
      .from("coaching_commitments")
      .update({ sort_order: next.sortOrder, updated_at: new Date().toISOString() })
      .eq("id", next.id);
    if (error) {
      console.error("[team/coaching/member] coaching_commitments sort_order", error);
      return { ok: false, error: "Could not save the order." };
    }
  }
  return { ok: true };
}

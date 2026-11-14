// The two reads an author's own spark needs (TH.4.6), beside data.ts rather
// than in it, which is at its size cap. Both raise on failure: one decides
// whether a withdrawal may be undone, and "no rows" would be the permissive
// answer there.
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { teamRead } from "./data";

// The actor's own withdrawn sparks, so Your sparks can lead back to them:
// getSharedIdeas leaves archived rows out, and without this a withdrawn spark
// could be put back only by someone who kept its address. Strictly self,
// never the reports the team scope also covers.
export async function ownWithdrawnSparks(actor: TeamActor): Promise<{ id: string; title: string }[]> {
  const rows = mustRows(
    await teamRead(actor, "ideas", "id, title").eq("person_id", actor.personId).eq("status", "archived").order("updated_at", { ascending: false }),
    "[team/spark-reads] own withdrawn sparks",
  );
  return rows as unknown as { id: string; title: string }[];
}

/** The latest status change audited on a spark, as the put-back check needs it. */
export type SparkStatusChange = { status: string | null; previous: string | null; withdrawnBy: string | null };

// The latest audited change of a spark's status: the author's withdrawal,
// their putting it back, or an admin's status change on the innovation shelf,
// all of which write newData.status. Put-back reads it so an author can undo
// only their own withdrawal, and returns the spark to the status it had then.
export async function lastSparkStatusChange(id: string): Promise<SparkStatusChange | null> {
  const rows = mustRows(
    await companyOs
      .from("audit_log")
      .select("old_data, new_data, context")
      .eq("table_name", "ideas")
      .eq("record_id", id)
      .not("new_data->>status", "is", null)
      .order("created_at", { ascending: false })
      .limit(1),
    "[team/spark-reads] spark status history",
  );
  const row = rows[0] as
    | { old_data: { status?: unknown } | null; new_data: { status?: unknown } | null; context: { withdrawn_by?: unknown } | null }
    | undefined;
  if (!row) return null;
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return { status: str(row.new_data?.status), previous: str(row.old_data?.status), withdrawnBy: str(row.context?.withdrawn_by) };
}

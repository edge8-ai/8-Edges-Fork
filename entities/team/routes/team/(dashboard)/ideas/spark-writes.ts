// The two steps every author-only spark action shares (TH.4): reading the
// spark as its author, and saving a new title. Not a "use server" file on
// purpose: an exported function there is a callable endpoint, and these are
// helpers for actions that have already run their guard.
import { recordAudit } from "@/kernel/audit/audit";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { teamRead, teamUpdateInScope } from "@/entities/team/lib/data";
import { relabelSparkCards } from "@/entities/boards";

export type OwnSpark = { id: string; person_id: string; kind: string; title: string; ai_plan: string | null; status: string };

// The actor's own spark, or why not. Strictly self: the team scope can include
// reports, so ownership is checked against actor.personId, never widened to the
// scope. A failed read is reported as a failure, never as "not yours": the two
// need different answers to the person.
export async function ownSpark(actor: TeamActor, id: string): Promise<{ ok: true; spark: OwnSpark } | { ok: false; error: string }> {
  const { data, error } = await teamRead(actor, "ideas", "id, person_id, kind, title, ai_plan, status").eq("id", id).maybeSingle();
  if (error) return { ok: false, error: "Could not load that spark. Try again in a moment." };
  const spark = data as OwnSpark | null;
  if (!spark || spark.person_id !== actor.personId) return { ok: false, error: "Only the person who shared this spark can change it." };
  return { ok: true, spark };
}

/**
 * Saves a spark row whose title may have changed: the one-line rename, and
 * the plan editor, which writes the title with the plan. A changed title is
 * audited, and the cards picked up from the spark carry a copy of it (TH.4.2),
 * so they are relabelled here, in the one place every title change passes.
 * The save stands either way: a card left behind is a note beside the
 * success, as a partial pick-up is, never an error that reads as if nothing
 * was saved.
 */
export async function saveSparkTitle(
  actor: TeamActor,
  id: string,
  oldTitle: string,
  patch: { title: string } & Record<string, unknown>,
): Promise<{ ok: true; note?: string } | { ok: false; error: string }> {
  const r = await teamUpdateInScope(actor, "ideas", id, patch);
  if (!r.ok) return { ok: false, error: r.error ?? "Could not save your changes." };
  if (oldTitle === patch.title) return { ok: true };
  const [, cards] = await Promise.all([
    recordAudit({ table: "ideas", recordId: id, operation: "update", actor: actor.displayName, oldData: { title: oldTitle }, newData: { title: patch.title } }),
    relabelSparkCards(id, patch.title),
  ]);
  if (!cards.ok) return { ok: true, note: `Saved. The card picked up from it still shows the old title: ${cards.error}` };
  return { ok: true };
}

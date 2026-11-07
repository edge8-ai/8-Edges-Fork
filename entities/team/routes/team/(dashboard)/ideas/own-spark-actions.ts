"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { recordAudit } from "@/kernel/audit/audit";
import type { Result } from "@/kernel/data/result";
import { teamUpdateInScope } from "@/entities/team/lib/data";
import { lastSparkStatusChange } from "@/entities/team/lib/spark-reads";
import { cardsForIdeas } from "@/entities/boards";
import { cleanSparkTitle, mayPutBack, statusAfterPutBack, withdrawRefusal } from "./own-spark";
import { ownSpark, saveSparkTitle } from "./spark-writes";

// What an author may do to their own spark (TH.4.6): fix the line of a spark
// that has no plan, withdraw it, and put it back. Ownership is checked against
// actor.personId (ownSpark) before teamUpdateInScope writes, never widened to
// the team scope. Each change is audited, and the status changes carry who
// withdrew so put-back can tell an author's withdrawal from an admin's archive
// (mayPutBack).

function revalidateSpark(id: string) {
  revalidatePath(`/team/ideas/${id}`);
  revalidatePath("/team/ideas");
  revalidatePath("/team");
}

// A spark with a plan keeps its title beside the plan, where EditablePlan
// edits both; this is the line of a spark that has none (most sparks: a
// one-line spark gets no Claude call).
export async function renameSpark(id: string, title: string): Promise<{ ok: true; note?: string } | { ok: false; error: string }> {
  await requirePermission("team.ideas");
  const actor = await requireTeamMember();

  const clean = cleanSparkTitle(title);
  if (!clean.ok) return { ok: false, error: clean.error };
  const own = await ownSpark(actor, id);
  if (!own.ok) return own;
  if (own.spark.ai_plan) return { ok: false, error: "This spark has a plan. Edit its title with the plan, below." };

  const saved = await saveSparkTitle(actor, id, own.spark.title, { title: clean.title });
  if (saved.ok) revalidateSpark(id);
  return saved;
}

export async function withdrawSpark(id: string): Promise<Result> {
  await requirePermission("team.ideas");
  const actor = await requireTeamMember();

  const own = await ownSpark(actor, id);
  if (!own.ok) return own;
  if (own.spark.status === "archived") return { ok: true };
  const refusal = withdrawRefusal(await cardsForIdeas([id]));
  if (refusal) return { ok: false, error: refusal };

  const r = await teamUpdateInScope(actor, "ideas", id, { status: "archived" });
  if (!r.ok) return { ok: false, error: r.error ?? "Could not withdraw the spark." };
  await recordAudit({
    table: "ideas",
    recordId: id,
    operation: "archive",
    actor: actor.displayName,
    oldData: { status: own.spark.status },
    newData: { status: "archived" },
    context: { withdrawn_by: actor.personId },
  });
  revalidateSpark(id);
  return { ok: true };
}

export async function putBackSpark(id: string): Promise<Result> {
  await requirePermission("team.ideas");
  const actor = await requireTeamMember();

  const own = await ownSpark(actor, id);
  if (!own.ok) return own;
  if (own.spark.status !== "archived") return { ok: true };
  const last = await lastSparkStatusChange(id);
  if (!mayPutBack(last, actor.personId)) {
    return { ok: false, error: "This spark was put away on the innovation shelf, so only an admin can bring it back." };
  }

  const status = statusAfterPutBack(last);
  const r = await teamUpdateInScope(actor, "ideas", id, { status });
  if (!r.ok) return { ok: false, error: r.error ?? "Could not put the spark back." };
  await recordAudit({
    table: "ideas",
    recordId: id,
    operation: "restore",
    actor: actor.displayName,
    oldData: { status: "archived" },
    newData: { status },
    context: { restored_by: actor.personId },
  });
  revalidateSpark(id);
  return { ok: true };
}

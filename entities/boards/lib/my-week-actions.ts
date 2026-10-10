"use server";
// The two writes My Week makes: Give it a day (W.171) and Start (W.173). New
// to you and No date ask the reader to give a card a day; Next up offers one
// card to start. Both act from the page, without opening the card.
//
// Each acts on a card assigned to the reader. The board gate decides who may
// touch the board at all; the assignee check is narrower on purpose: My Week
// is a self-view, so its controls act only on the reader's own cards, and a
// member of the board who is not the assignee keeps the card's drawer for that.
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { companyOs } from "@/kernel/data/supabase";
import { recordAudit } from "@/kernel/audit/audit";
import type { Result } from "@/kernel/data/result";
import { boardMutation } from "./mutation";
import { refresh } from "./card-helpers";
import { landCard } from "./land-card";

const input = z.object({
  taskId: z.string().min(1),
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
});

// Not exported: a "use server" file may export only async functions, which the
// test runner does not enforce and the Next runtime does.
const NOT_YOURS = "Only the person a card is assigned to can give it a day from My Week.";

/** A form action for useActionState: the card id and the date come in the form. */
export async function giveDay(_prev: Result | null, form: FormData): Promise<Result> {
  // No type argument on the call: check-action-auth reads `await boardMutation(`
  // literally, and `boardMutation<…>(` hides the guard from it.
  const gate = await boardMutation({ table: "tasks", id: String(form.get("taskId") ?? ""), select: "board_id, assignee_id, status", label: "card" });
  if (!gate.ok) return gate;
  const card = gate.row as { board_id: string; assignee_id: string | null; status: string };
  const parsed = input.safeParse({ taskId: form.get("taskId"), due: form.get("due") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Pick a date." };
  const { taskId, due } = parsed.data;
  // A string that matches the pattern can still name no day ("2026-02-31").
  if (Number.isNaN(Date.parse(`${due}T00:00:00Z`)) || new Date(`${due}T00:00:00Z`).toISOString().slice(0, 10) !== due) {
    return { ok: false, error: "Pick a date." };
  }
  if (!gate.actor.personId || card.assignee_id !== gate.actor.personId) return { ok: false, error: NOT_YOURS };
  if (card.status !== "open") return { ok: false, error: "This card is no longer open." };

  const { error } = await companyOs.from("tasks").update({ due_date: due }).eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "tasks", recordId: taskId, operation: "update", actor: gate.actor.label, newData: { due_date: due } });
  revalidatePath("/team/my-week");
  refresh();
  return { ok: true };
}

// Start (W.173): Next up's one button. It moves the reader's own open card out
// of its board's first column into the next live one — the same rule the page
// uses to say a card has started (pastFirstColumn in my-week.ts), so a card
// started here lands under In progress and nowhere else. The landing itself is
// the board's (landCard): the position, the stage log, the audit row.
export async function startCard(_prev: Result | null, form: FormData): Promise<Result> {
  const gate = await boardMutation({
    table: "tasks",
    id: String(form.get("taskId") ?? ""),
    select: "id, board_id, board_column_id, assignee_id, status, subject_type, subject_id",
    label: "card",
  });
  if (!gate.ok) return gate;
  const card = gate.row as {
    id: string;
    board_id: string;
    board_column_id: string | null;
    assignee_id: string | null;
    status: string;
    subject_type: string | null;
    subject_id: string | null;
  };
  if (!gate.actor.personId || card.assignee_id !== gate.actor.personId) return { ok: false, error: "Only the person a card is assigned to can start it from My Week." };
  if (card.status !== "open") return { ok: false, error: "This card is no longer open." };

  const [colRes, boardRes] = await Promise.all([
    companyOs.from("board_columns").select("id, position, is_done, is_not_doing").eq("board_id", card.board_id).order("position"),
    companyOs.from("boards").select("slug").eq("id", card.board_id).maybeSingle(),
  ]);
  if (colRes.error) return { ok: false, error: colRes.error.message };
  if (boardRes.error) return { ok: false, error: boardRes.error.message };
  const live = ((colRes.data ?? []) as { id: string; is_done: boolean; is_not_doing: boolean | null }[]).filter((c) => !c.is_done && !c.is_not_doing);
  const target = live[1];
  if (!target || !boardRes.data) return { ok: false, error: "This board has no column for work in progress." };
  // Already past the first column: it has started, and there is nothing to do.
  if (card.board_column_id !== live[0]?.id) return { ok: true };

  const slug = (boardRes.data as { slug: string }).slug;
  const landed = await landCard({
    taskId: card.id,
    actor: gate.actor,
    from: { boardId: card.board_id, columnId: card.board_column_id, isDone: false, status: card.status },
    to: { boardId: card.board_id, boardSlug: slug, columnId: target.id, isDone: false, isNotDoing: false },
    subject: { type: card.subject_type, id: card.subject_id },
    logNote: "started from My Week",
    refreshSlugs: [slug],
  });
  // Home shows the same Next up (TH.1.3), so a start from either page redraws both.
  if (landed.ok) {
    revalidatePath("/team/my-week");
    revalidatePath("/team");
  }
  return landed;
}

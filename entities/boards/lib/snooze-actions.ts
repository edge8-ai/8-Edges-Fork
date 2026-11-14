"use server";

// Snoozing a card until a date (W.54), split from actions.ts by responsibility
// rather than by size: "park this until the 3rd" is a different act from
// editing what the card says, and the two have no shared state.
//
// NO MIGRATION, deliberately. tasks.metadata is jsonb and already carries the
// card's loose keys (assigned_at, pr_url, build_summary, source), so the date
// goes there. The trade-off is stated rather than hidden: no CHECK constraint
// and no index, so a malformed value is possible and the wake-up is a
// comparison in the reader, not a query the database can plan. At the board's
// size that is the right trade — and `cardSnoozedUntil` refuses anything that
// is not a YYYY-MM-DD string, so a bad value reads as "not snoozed" and can
// never hide a card for good.
//
// The first statement of each action is `boardMutation`, so it is gated
// exactly as the actions in actions.ts (check-action-auth lists it as a guard).

import { companyOs, type CompanyOsUpdate } from "@/kernel/data/supabase";
import { recordAudit } from "@/kernel/audit/audit";
import { type Result } from "@/kernel/data/result";
import { boardMutation } from "./mutation";
import { refresh } from "./card-helpers";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Park a card until `until` (a YYYY-MM-DD date), or wake it now with null.
 *
 * There is no cron behind this and there does not need to be one: the card
 * carries the date, every reader compares it against today, and the card wakes
 * by itself the morning the date arrives. Nothing has to run for that to
 * happen, which is the whole reason the date lives on the card.
 */
export async function snoozeCard(taskId: string, until: string | null, boardSlug: string): Promise<Result> {
  const gate = await boardMutation({ table: "tasks", id: taskId, select: "board_id, metadata", label: "card" });
  if (!gate.ok) return gate;
  const { actor } = gate;
  const current = (gate.row as { board_id: string; metadata: Record<string, unknown> | null }).metadata ?? {};
  if (until !== null && !DATE.test(until)) return { ok: false, error: "Pick a date to snooze until." };

  const meta = { ...current };
  if (until) meta.snoozed_until = until;
  else delete meta.snoozed_until;

  const updates: CompanyOsUpdate<"tasks"> = { metadata: meta as CompanyOsUpdate<"tasks">["metadata"] };
  const { error } = await companyOs.from("tasks").update(updates).eq("id", taskId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "tasks", recordId: taskId, operation: "update", actor: actor.label, newData: { snoozed_until: until } });
  refresh(boardSlug);
  return { ok: true };
}


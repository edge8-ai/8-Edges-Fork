"use server";

// Editing a board's card templates (W.58). Its own file rather than another
// paragraph in actions.ts: templates are a setting of the BOARD, and the one
// thing the action has to get right is the schema at the boundary.
//
// The guard is the first statement, as in every other board action.

import { companyOs, type CompanyOsUpdate } from "@/kernel/data/supabase";
import { recordAudit } from "@/kernel/audit/audit";
import { type Result } from "@/kernel/data/result";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import { boardMutation } from "./mutation";
import { refresh } from "./card-helpers";
import { cardTemplateList, type CardTemplate } from "./card-templates";

/**
 * Replace a board's whole template list.
 *
 * Whole-list rather than per-template: the list is one jsonb value, and a
 * read-modify-write per row would give two people editing settings at once a
 * way to lose each other's template silently. One value, one write.
 *
 * Validated with Zod before it is stored, so the only malformed templates the
 * reader can ever meet are ones that did not come through here.
 */
export async function setCardTemplates(boardId: string, templates: CardTemplate[], boardSlug: string): Promise<Result> {
  // The board is the row here, so the gate takes it by id directly rather
  // than reading a board_id off something else.
  const gate = await boardMutation({ boardId });
  if (!gate.ok) return gate;
  const { actor } = gate;
  const parsed = cardTemplateList.safeParse(templates);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };

  const { data: row, error: readErr } = await companyOs.from("boards").select("metadata").eq("id", boardId).maybeSingle();
  // Read-modify-write on one jsonb value: a failed read must not become an
  // empty object, or saving templates would silently drop the board's other
  // metadata keys (its weekly-sprint chat among them).
  if (readErr) return { ok: false, error: `Could not read the board's settings: ${readErr.message}` };
  if (!row) return { ok: false, error: "That board is gone." };
  const current = (row as { metadata: Record<string, unknown> | null }).metadata ?? {};
  const meta = { ...current };
  // An empty list removes the key rather than storing []: a board with no
  // templates should look, in the jsonb and on screen, exactly like a board
  // that never had any.
  if (parsed.data.length) meta.card_templates = parsed.data;
  else delete meta.card_templates;

  const updates: CompanyOsUpdate<"boards"> = { metadata: meta as CompanyOsUpdate<"boards">["metadata"] };
  const { error } = await companyOs.from("boards").update(updates).eq("id", boardId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "boards", recordId: boardId, operation: "update", actor: actor.label, newData: { card_templates: parsed.data.length } });
  refresh(boardSlug);
  return { ok: true };
}

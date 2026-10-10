"use server";

// A card's deliverables (W.155): what the card's work produced, other than its
// PR — links now, files with W.128. Team only: every action is gated on board
// membership, which a portal member never has, and the portal's card shape
// carries none of this (clientSafeCard).
//
// Remove ARCHIVES, never deletes: undo puts the row back, and the daily sweep
// (W.157) purges a file's object a month after it was archived.

import { companyOs } from "@/kernel/data/supabase";
import { recordAudit } from "@/kernel/audit/audit";
import { externalHref } from "@/kernel/ui/url";
import { boardMutation } from "./mutation";
import { prKey } from "./types";
import { DELIVERABLE_COLUMNS, shapeDeliverable, signPreviews, type DeliverableRow } from "./deliverable-shape";
import type { Deliverable } from "./deliverable-types";

/** The card's live, confirmed deliverables, oldest first, as the drawer lists them. */
export async function listCardDeliverables(taskId: string): Promise<{ ok: true; items: Deliverable[] } | { ok: false; error: string }> {
  const gate = await boardMutation({ table: "tasks", id: taskId, label: "card" });
  if (!gate.ok) return gate;
  const { data, error } = await companyOs
    .from("task_attachments")
    .select(DELIVERABLE_COLUMNS)
    .eq("task_id", taskId)
    .is("archived_at", null)
    .not("confirmed_at", "is", null)
    .order("created_at", { ascending: true });
  if (error) return { ok: false, error: `Could not load the card's deliverables: ${error.message}` };
  const rows = data as unknown as DeliverableRow[];
  const preview = await signPreviews(rows);
  return { ok: true, items: rows.map((r) => shapeDeliverable(r, r.storage_path ? (preview.get(r.storage_path) ?? null) : null)) };
}

/**
 * Adds a link. Only an http(s) address is stored (the table refuses anything
 * else too), and a GitHub pull request is refused: a card's PR is a field, not
 * a deliverable, so it lives in one place and shows its merge state there. The
 * drawer offers the PR field before it ever calls this; the refusal is for
 * every other caller.
 */
export async function addCardLink(taskId: string, rawUrl: string): Promise<{ ok: true; item: Deliverable } | { ok: false; error: string }> {
  const gate = await boardMutation({ table: "tasks", id: taskId, label: "card" });
  if (!gate.ok) return gate;
  const url = externalHref(rawUrl);
  if (!url) return { ok: false, error: "That isn't a web address. Paste a link that starts with https://." };
  if (prKey(url)) return { ok: false, error: "That's a pull request. It goes in the PR field, where it shows its merge state." };

  const { data: existing, error: readError } = await companyOs
    .from("task_attachments")
    .select("id")
    .eq("task_id", taskId)
    .eq("kind", "link")
    .eq("url", url)
    .is("archived_at", null)
    .limit(1);
  if (readError) return { ok: false, error: `Could not check the card's links: ${readError.message}` };
  if ((existing ?? []).length > 0) return { ok: false, error: "That link is already on the card." };

  const { data, error } = await companyOs
    .from("task_attachments")
    .insert({ task_id: taskId, kind: "link", url, uploaded_by: gate.actor.personId, confirmed_at: new Date().toISOString() })
    .select(DELIVERABLE_COLUMNS)
    .single();
  if (error) return { ok: false, error: error.message };
  const item = shapeDeliverable(data as unknown as DeliverableRow);
  await recordAudit({ table: "task_attachments", recordId: item.id, operation: "insert", actor: gate.actor.label, newData: { task_id: taskId, kind: "link", url } });
  return { ok: true, item };
}

/** Takes a deliverable off the card, keeping the row so undo can put it back. */
export async function removeCardDeliverable(taskId: string, deliverableId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await boardMutation({ table: "tasks", id: taskId, label: "card" });
  if (!gate.ok) return gate;
  const { data, error } = await companyOs
    .from("task_attachments")
    .update({ archived_at: new Date().toISOString(), archived_by: gate.actor.personId })
    .eq("id", deliverableId)
    .eq("task_id", taskId)
    .is("archived_at", null)
    .select("id");
  if (error) return { ok: false, error: error.message };
  // Nothing matched: someone removed it a moment ago, or it is on another card.
  if ((data ?? []).length === 0) return { ok: false, error: "That deliverable is no longer on the card." };
  await recordAudit({ table: "task_attachments", recordId: deliverableId, operation: "update", actor: gate.actor.label, newData: { archived: true } });
  return { ok: true };
}

/** Undo for remove: the deliverable goes back on the card as it was. */
export async function restoreCardDeliverable(taskId: string, deliverableId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await boardMutation({ table: "tasks", id: taskId, label: "card" });
  if (!gate.ok) return gate;
  const { data, error } = await companyOs
    .from("task_attachments")
    .update({ archived_at: null, archived_by: null })
    .eq("id", deliverableId)
    .eq("task_id", taskId)
    .not("archived_at", "is", null)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if ((data ?? []).length === 0) return { ok: false, error: "That deliverable can't be put back any more." };
  await recordAudit({ table: "task_attachments", recordId: deliverableId, operation: "update", actor: gate.actor.label, newData: { archived: false } });
  return { ok: true };
}

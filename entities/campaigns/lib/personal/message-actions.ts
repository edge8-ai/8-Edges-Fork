"use server";
// A personal email's decisions (RT.1): approve, edit, cancel. Moved here from
// the Personal page's route (unchanged in rule) so Revenue today can offer
// Approve and Skip beside the deals: a route may only reach another entity
// through its door, and a door may not reach into a route.
import { revalidateSurfaces } from "@/kernel/shell/surface";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { getMessage, updateMessage } from "./data";

type ActionResult = { ok: true } | { ok: false; error: string };

function refresh(id?: string) {
  revalidateSurfaces("/revenue/marketing/recurring");
  revalidateSurfaces("/revenue");
  if (id) revalidateSurfaces(`/revenue/marketing/personal/${id}`);
}

async function messageForAction(id: string) {
  const message = await getMessage(id);
  if (!message) return { message: null, error: "Message not found." };
  return { message, error: null };
}

export async function approveMessage(id: string): Promise<ActionResult> {
  const { user: admin } = await requirePermission("campaigns.marketing");
  const { message, error } = await messageForAction(id);
  if (!message) return { ok: false, error: error! };
  if (message.status !== "held" && message.status !== "drafted") return { ok: false, error: `The message is ${message.status}; only a held or drafted one can be approved.` };
  if (!message.subject.trim() || !message.bodyMd.trim()) return { ok: false, error: "The message has no subject or body; edit it first." };
  const now = new Date().toISOString();
  const saved = await updateMessage(id, { status: "approved", holdReason: null, approvedBy: admin.email, approvedAt: now });
  if (!saved.ok) return saved;
  await recordAudit({ table: "email_messages", recordId: id, operation: "update", actor: admin.email, context: { status: "approved" } });
  refresh(message.agentId);
  return { ok: true };
}

export async function editMessage(id: string, input: { subject: string; bodyMd: string }): Promise<ActionResult> {
  const { user: admin } = await requirePermission("campaigns.marketing");
  const { message, error } = await messageForAction(id);
  if (!message) return { ok: false, error: error! };
  if (!["held", "drafted", "approved"].includes(message.status)) return { ok: false, error: `The message is ${message.status} and can no longer be edited.` };
  const subject = input.subject.trim();
  const bodyMd = input.bodyMd.trim();
  if (!subject || !bodyMd) return { ok: false, error: "Subject and body are both needed." };
  const saved = await updateMessage(id, { subject, bodyMd, editedAt: new Date().toISOString() });
  if (!saved.ok) return saved;
  await recordAudit({ table: "email_messages", recordId: id, operation: "update", actor: admin.email, context: { edited: true } });
  refresh(message.agentId);
  return { ok: true };
}

export async function cancelMessage(id: string): Promise<ActionResult> {
  const { user: admin } = await requirePermission("campaigns.marketing");
  const { message, error } = await messageForAction(id);
  if (!message) return { ok: false, error: error! };
  if (message.status === "sent" || message.status === "sending") return { ok: false, error: "The message has already gone." };
  const saved = await updateMessage(id, { status: "cancelled", holdReason: `cancelled by ${admin.email}` });
  if (!saved.ok) return saved;
  await recordAudit({ table: "email_messages", recordId: id, operation: "update", actor: admin.email, context: { status: "cancelled" } });
  refresh(message.agentId);
  return { ok: true };
}


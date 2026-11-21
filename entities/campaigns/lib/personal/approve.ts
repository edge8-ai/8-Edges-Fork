// Server-only. Approving a personal email, which is what sends it: the send
// routine (send.ts) takes an approved message on its next run (RT.1). The
// rule lives here once, for the Personal page's action and for the Edge8
// connector's held send (OC.4), which runs it as the person who asked after
// its hold. Only a held or drafted message with a subject and a body can be
// approved.
import { recordAudit } from "@/kernel/audit/audit";
import { getMessage, updateMessage } from "./data";

export async function approveMessageAs(id: string, approverEmail: string): Promise<{ ok: true; agentId: string } | { ok: false; error: string }> {
  const message = await getMessage(id);
  if (!message) return { ok: false, error: "Message not found." };
  if (message.status !== "held" && message.status !== "drafted") return { ok: false, error: `The message is ${message.status}; only a held or drafted one can be approved.` };
  if (!message.subject.trim() || !message.bodyMd.trim()) return { ok: false, error: "The message has no subject or body; edit it first." };
  const saved = await updateMessage(id, { status: "approved", holdReason: null, approvedBy: approverEmail, approvedAt: new Date().toISOString() });
  if (!saved.ok) return saved;
  await recordAudit({ table: "email_messages", recordId: id, operation: "update", actor: approverEmail, context: { status: "approved" } });
  return { ok: true, agentId: message.agentId };
}

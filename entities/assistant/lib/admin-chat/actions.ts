// Server-only. Executors for the assistant's privileged tools. Both are only
// ever called from app/api/admin/chat/route.ts AFTER the privileged admin
// clicked Approve on the exact payload in the chat UI.

import { recordAudit } from "@/kernel/audit/audit";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { invitePortalMemberCore, resendPortalLinkCore } from "@/entities/crm";
import { runApprovedWrite } from "./db";
import { escapeHtml } from "@/kernel/config/html";

export type ActionOutcome = {
  ok: boolean;
  // Goes back to the model as the tool_result.
  resultForModel: string;
  // One-liner for the widget's tool chip.
  chipDetail: string;
};

// Best-effort table name for the audit row; the full SQL goes in context.
function tableFromSql(sql: string): string {
  const m = /^\s*(?:insert\s+into|update)\s+(?:only\s+)?("?[\w.]+"?)/i.exec(sql);
  return (m?.[1] ?? "unknown").replace(/"/g, "").replace(/^company_os\./i, "");
}

export async function performApprovedWrite(
  input: Record<string, unknown>,
  adminEmail: string,
): Promise<ActionOutcome> {
  const sql = typeof input.sql === "string" ? input.sql : "";
  const res = await runApprovedWrite(sql);
  if (!res.ok) {
    return { ok: false, resultForModel: res.error, chipDetail: sql };
  }
  await recordAudit({
    table: tableFromSql(sql),
    operation: res.command,
    actor: adminEmail,
    context: { source: "admin_chatbot", sql },
  });
  return {
    ok: true,
    resultForModel: JSON.stringify({
      command: res.command,
      affectedRows: res.affectedRows,
      ...(res.rows.length ? { returning: res.rows } : {}),
    }),
    chipDetail: sql,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function performApprovedPortalInvite(
  input: Record<string, unknown>,
  adminEmail: string,
): Promise<ActionOutcome> {
  const action = input.action === "resend_link" ? "resend_link" : "invite";
  const personId = typeof input.person_id === "string" ? input.person_id : "";
  const companyId = typeof input.company_id === "string" ? input.company_id : "";
  const chipDetail = typeof input.summary === "string" ? input.summary : personId;

  if (!UUID_RE.test(personId) || !UUID_RE.test(companyId)) {
    return {
      ok: false,
      resultForModel: "person_id and company_id must be UUIDs from the database.",
      chipDetail,
    };
  }

  const res =
    action === "invite"
      ? await invitePortalMemberCore(personId, companyId, adminEmail, "admin_chatbot")
      : await resendPortalLinkCore(personId, companyId, adminEmail, "admin_chatbot");

  return res.ok
    ? { ok: true, resultForModel: JSON.stringify({ done: true, message: res.message }), chipDetail }
    : { ok: false, resultForModel: res.error, chipDetail };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SUBJECT_CHARS = 200;
const MAX_BODY_CHARS = 10_000;

// Plain text -> minimal HTML: blank lines split paragraphs, single newlines
// become <br>. The admin approved the plain text, so no other markup is added.
function bodyToHtml(body: string): string {
  return body
    .trim()
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

export async function performApprovedEmail(
  input: Record<string, unknown>,
  adminEmail: string,
): Promise<ActionOutcome> {
  const to = typeof input.to === "string" ? input.to.trim() : "";
  const subject = typeof input.subject === "string" ? input.subject.trim() : "";
  const body = typeof input.body === "string" ? input.body.trim() : "";

  const fail = (error: string): ActionOutcome => ({
    ok: false,
    resultForModel: error,
    chipDetail: to,
  });
  if (!EMAIL_RE.test(to) || /[,;]/.test(to)) {
    return fail("`to` must be exactly one valid email address.");
  }
  if (!subject || subject.length > MAX_SUBJECT_CHARS) {
    return fail(`Subject is required (max ${MAX_SUBJECT_CHARS} chars).`);
  }
  if (!body || body.length > MAX_BODY_CHARS) {
    return fail(`Body is required (max ${MAX_BODY_CHARS} chars).`);
  }

  // sendTransactionalEmail logs every accepted send to interactions (matched
  // to the person by email); the metadata below marks it as chatbot-sent.
  const sent = await sendTransactionalEmail({
    to,
    subject,
    html: bodyToHtml(body),
    replyTo: adminEmail,
    logMeta: { source: "admin_chatbot", sent_by: adminEmail },
  });
  if (!sent) {
    return fail("The email provider did not accept the send. Do not retry blindly.");
  }

  return {
    ok: true,
    resultForModel: JSON.stringify({ sent: true, to, subject, loggedToInteractions: true }),
    chipDetail: to,
  };
}
